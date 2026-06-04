# Documento de Arquitectura Técnica: Banco Nexus

Este documento detalla el diseño de infraestructura, topología de red, seguridad y arquitectura de software para el proyecto final de simulación bancaria implementado sobre **Amazon Web Services (AWS)** con **Docker Swarm**.

---

## 1. Topología de Infraestructura en la Nube (AWS)

La arquitectura de red está diseñada bajo principios de **Alta Disponibilidad (HA)**, **Escalabilidad Horizontal** y **Tolerancia a Fallos**.

```mermaid
graph TD
    subgraph Internet_Public["Internet Pública"]
        UserBrowser["Navegador del Cliente"]
    end

    subgraph AWS_Cloud["Nube de Amazon Web Services (AWS)"]
        subgraph VPC["VPC: 10.0.0.0/16"]
            
            subgraph Public_Subnet["Subnet Pública (10.0.1.0/24)"]
                IGW["Internet Gateway"]
                ALB["AWS Application Load Balancer"]
                EC2_FE["EC2 Instance: Frontend Node<br>Private IP: 10.0.1.10<br>(Docker Swarm Node)"]
            end

            subgraph Private_Subnet["Subnet Privada (10.0.2.0/24)"]
                EC2_BE1["EC2 Instance: Backend Manager 1<br>Private IP: 10.0.2.20<br>(Docker Swarm Mgr)"]
                EC2_BE2["EC2 Instance: Backend Worker 2<br>Private IP: 10.0.2.30<br>(Docker Swarm Worker)"]
                NAT_GW["NAT Gateway"]
            end
        end

        subgraph Managed_Cloud_Services["Servicios Administrados Externos (Cloud)"]
            Database_Svc["Supabase / Aiven PostgreSQL<br>(Alta Disponibilidad con Réplicas)"]
            Registry_Svc["Docker Hub / AWS ECR<br>(Registro de Imágenes)"]
        end
    end

    UserBrowser -->|Petición HTTPS - Puerto 443/80| ALB
    ALB -->|Balanceo de Carga| EC2_FE
    EC2_FE -->|Nginx Proxy Inverso /api/| Overlay_Net
    
    subgraph Swarm_Internal["Red Superpuesta (Overlay Network: bank-net)"]
        Overlay_Net{{"Red Superpuesta Swarm"}}
        Overlay_Net -->|Carga Balanceada por Mesh Routing| EC2_BE1
        Overlay_Net -->|Carga Balanceada por Mesh Routing| EC2_BE2
    end

    EC2_BE1 -->|Transacciones ACID (Puerto 5432)| Database_Svc
    EC2_BE2 -->|Transacciones ACID (Puerto 5432)| Database_Svc
    
    EC2_BE1 -.->|Descarga Imagen| Registry_Svc
    EC2_BE2 -.->|Descarga Imagen| Registry_Svc
```

### Componentes de AWS Utilizados:
1. **VPC (Virtual Private Cloud)**: Segmentación de red aislada para alojar toda la infraestructura.
2. **Subnet Pública**: Aloja el Application Load Balancer y la instancia EC2 del Frontend, permitiendo la comunicación desde el exterior.
3. **Subnets Privadas**: Alojamiento de las instancias EC2 del Backend Monolítico. No son accesibles desde internet, protegiendo las bases de datos y servicios lógicos de negocio. La salida a internet para descarga de paquetes se hace a través de un **NAT Gateway**.
4. **Instancias EC2 (Mínimo 3 Máquinas)**:
   - **Instancia 1 (Frontend)**: Ejecuta una réplica del contenedor Nginx que sirve los archivos estáticos y rutea las peticiones de la API.
   - **Instancias 2 y 3 (Backend Replicado)**: Forman el clúster de Docker Swarm de procesamiento de lógica de negocio (Monolito Express). Actúan en modo redundante activo-activo.
5. **Database Administrada**: PostgreSQL montado sobre Supabase o Aiven, garantizando backups automatizados, alta disponibilidad de almacenamiento y cumplimiento de ACID.

---

## 2. Orquestación y Clúster de Docker Swarm

El clúster está configurado mediante **Docker Swarm** para proveer orquestación nativa, balanceo de carga y despliegues sin interrupciones.

* **Red de Tipo Overlay (`bank-net`)**: Red virtualizada superpuesta que conecta de manera encriptada y aislada el contenedor del Frontend (Nginx) con las réplicas del Backend en diferentes máquinas físicas.
* **Routing Mesh (Malla de Enrutamiento)**: Docker Swarm balancea las peticiones internas que recibe el puerto 5000 entre las réplicas activas del backend de manera transparente.
* **Tolerancia a Fallos**: Si la instancia `EC2_BE2` falla o se apaga, el Swarm Manager detecta la pérdida y levanta una réplica del backend en `EC2_BE1` de inmediato para mantener las 2 réplicas requeridas.
* **Rolling Updates (Actualización sin Caídas)**:
  El despliegue progresivo está configurado en `docker-compose.yml`:
  ```yaml
  update_config:
    parallelism: 1
    delay: 10s
    order: start-first
  ```
  Al actualizar la imagen del backend, Swarm levantará primero un nuevo contenedor (`start-first`) con la versión actualizada, validará su estado de salud, y solo después detendrá el contenedor antiguo. Esto garantiza **cero tiempo de inactividad (Zero-Downtime)**.

---

## 3. Arquitectura del Software y Consistencia (ACID)

La aplicación implementa una estructura desacoplada en el cliente y unificada en el servidor.

### A. Capa de Backend (Monolito)
Consolida la autenticación, transacciones, agenda de contactos y bitácora en una única unidad lógica contenedorizada:
* **Autenticación**: JWT (JSON Web Tokens) firmados en el servidor y almacenados en el navegador del cliente.
* **Encriptación de Contraseñas**: Bcrypt con 10 rondas de salt (encriptación irreversible de grado militar).
* **Validación Regex**: Cada endpoint de transferencia valida que la cuenta destino cumpla estrictamente con la expresión regular `/^\d{10}$/` antes de realizar llamadas de base de datos.

### B. Garantía Transaccional ACID en Transferencias (Motor Crítico)
Para asegurar que el saldo retirado del cliente $A$ sea sumado exactamente al cliente $B$ sin peligro de pérdida en fallas del sistema:
1. **Transacciones Aisladas**: La operación se ejecuta dentro de un bloque SQL `BEGIN ... COMMIT` manejado por el Pool del cliente PostgreSQL.
2. **Evitar Race Conditions con Bloqueo de Filas (`SELECT FOR UPDATE`)**:
   Antes de leer y validar los saldos, el backend ejecuta:
   ```sql
   SELECT balance FROM users WHERE account_number = $1 FOR UPDATE;
   ```
   Esto bloquea la fila del usuario en la base de datos a nivel de motor. Si el usuario intenta enviar dos peticiones simultáneas extremadamente rápidas (ataque de doble gasto), la segunda petición se encolará y esperará a que la primera termine, evitando transacciones con saldos desactualizados.
3. **Rollback Automático**: En caso de saldo insuficiente, cuenta destino no existente o error de red a mitad del proceso, se dispara `ROLLBACK`, devolviendo la base de datos a su estado original íntegro.

---

## 4. Algoritmo de Cálculo y Reglas del Número de Cuenta

El número de cuenta de 10 dígitos es único e inmutable, y su dígito verificador se calcula con un algoritmo aritmético para prevenir errores de captura.

```
+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+
|  1  |  8  |  0  |  X  |  X  |  X  |  X  |  X  |  X  |  D  |
+-----+-----+-----+-----+-----+-----+-----+-----+-----+-----+
 \_______________/ \_______________________________/ \_____/
  Prefijo Origen           ID Secuencial DB          Verificador
```

### Algoritmo Paso a Paso (Ejemplo ID = 34):
1. **Prefijo Fijo**: `180`.
2. **ID Secuencial Formateado**: Se extrae el ID de la base de datos y se formatea a 6 dígitos con ceros a la izquierda (`000034`). La base resultante es `180000034`.
3. **Suma de Dígitos**: $1+8+0+0+0+0+0+3+4 = 16$.
4. **Módulo 10**: $16 \pmod{10} = 6$.
5. **Consolidación**: Se añade el dígito al final, obteniendo la cuenta definitiva: `1800000346`.

### Reglas de Negocio:
* **Unicidad Estricta**: Campo indexado con restricción `UNIQUE` en la base de datos.
* **Inmutabilidad**: El número de cuenta solo se escribe en el registro y no posee endpoints de actualización en la API.

---

## 5. Notificaciones y Bitácora de Auditoría

* **Bitácora de Eventos (Inmutable)**: Tabla `event_logs` que registra la fecha, ID de usuario, acción realizada (ej: `login_failed`, `transfer_approved`), estado (`success`/`failed`) y detalles JSON con metadatos contextuales (conceptos, montos, IPs).
* **Alertas de Movimientos**: El cliente SPA cuenta con un sistema de Toast dinámico que muestra de forma inmediata confirmaciones visuales al concluir transacciones.
