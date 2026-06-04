# Banco Nexus - Simulador de Transferencias Bancarias (Proyecto Final)

Este proyecto consiste en un sistema de simulación bancaria web diseñado bajo los pilares de la computación en la nube: **Alta Disponibilidad**, **Escalabilidad Horizontal**, **Consistencia Transaccional (ACID)** y **Automatización CI/CD**.

La infraestructura está preparada para desplegarse de manera distribuida en **AWS EC2** utilizando un clúster de **Docker Swarm**.

---

## Tecnologías y Estructura

El proyecto está organizado en las siguientes carpetas:

```
├── .github/workflows/      # Pipeline de CI/CD (GitHub Actions)
├── backend/                # API Monolítica (Node.js + Express)
│   ├── config/             # Conexión a la base de datos (PostgreSQL)
│   ├── middleware/         # Autenticación segura con JWT
│   ├── routes/             # Endpoints (auth, transfers, accounts, audit)
│   ├── utils/              # Algoritmo de número de cuenta (módulo 10)
│   ├── init.sql            # Script SQL de estructura e índices únicos
│   ├── Dockerfile          # Imagen optimizada del backend
│   └── server.js           # Punto de entrada de la aplicación
├── frontend/               # SPA Interfaz Premium (Estética Glassmorphism)
│   ├── index.html          # Estructura del portal web SPA
│   ├── style.css           # Estilos CSS con variables y responsivo
│   ├── app.js              # Lógica AJAX, ruteo SPA y Toasts de alertas
│   ├── nginx.conf          # Configuración del proxy inverso y estáticos
│   └── Dockerfile          # Imagen de Nginx Alpine
├── docker-compose.yml      # Configuración multicontenedor y Swarm
├── architecture.md         # Documento detallado de arquitectura técnica
└── README.md               # Instrucciones de uso (este archivo)
```

---

## Despliegue Local para Desarrollo

Para ejecutar el proyecto de forma local con Docker de forma inmediata (sin necesidad de configurar bases de datos externas):

1. **Clonar el repositorio** y abrir la terminal en la raíz del proyecto.
2. Ejecutar la compilación y levantamiento de contenedores con:
   ```bash
   docker-compose up --build
   ```
3. Este comando iniciará:
   - Un contenedor de **PostgreSQL** (`db`) que se inicializa automáticamente con el esquema de `init.sql`.
   - Dos contenedores del **Backend** (`backend`) que se conectan a la base de datos.
   - Un contenedor de **Frontend** (`frontend`) con Nginx escuchando en el puerto `80`.
4. Abre tu navegador e ingresa a: **`http://localhost`**
5. Registra un nuevo usuario para probar el sistema. Recibirás un número de cuenta único de 10 dígitos calculado matemáticamente. El sistema le asignará un saldo inicial de `$1,000.00 MXN` de simulación.

---

## Despliegue en AWS con Docker Swarm

### Paso 1: Configurar la Base de Datos Externa (Servicio Administrado)
Para producción y persistencia inmutable en la nube, debes usar un servicio administrado (como **Supabase** o **Aiven**).
1. Crea un proyecto de base de datos PostgreSQL en Supabase.
2. Copia la cadena de conexión de base de datos (URI).
3. Configura la base de datos ejecutando el código SQL de `backend/init.sql` en el editor de consultas SQL de Supabase.

### Paso 2: Inicializar el Clúster de Swarm en las Instancias EC2
1. En tu máquina **EC2 Manager**, inicializa el Swarm:
   ```bash
   docker swarm init --advertise-addr <IP_PRIVADA_MANAGER>
   ```
2. Copia el comando `docker swarm join` generado y ejecútalo en las máquinas **EC2 Worker** para unirlas al clúster.
3. Crea la red superpuesta (overlay network):
   ```bash
   docker network create --driver overlay --attachable bank-net
   ```

### Paso 3: Desplegar la Aplicación (Stack)
En la máquina manager, ejecuta el despliegue del stack usando el archivo de configuración:
```bash
# Define la URL de tu base de datos Supabase/Aiven en la sesión
export DATABASE_URL="postgresql://postgres:contraseña@db-endpoint:5432/postgres"

# Despliega los servicios en el clúster
docker stack deploy -c docker-compose.yml banconexus
```

Docker Swarm distribuirá las réplicas automáticamente:
- **2 réplicas del Backend** corriendo en las instancias de backend asignadas (para alta disponibilidad).
- **1 réplica del Frontend** sirviendo el portal a través de Nginx y redirigiendo `/api` balanceadamente al backend por el Mesh routing.

---

## Automatización CI/CD (GitHub Actions)

El archivo `.github/workflows/deploy.yml` implementa el flujo de integración y entrega continua (Rolling Update) al hacer un `git push` a la rama `main`:

1. **Build & Push**: Compila las imágenes de Docker de Backend y Frontend etiquetadas con el ID del commit y las sube a un Container Registry (Docker Hub o AWS ECR).
2. **Deploy**: Se conecta por SSH de forma segura al nodo manager de AWS EC2.
3. **Rolling Update**: Actualiza la versión de las imágenes y ejecuta `docker stack deploy`. Docker Swarm realiza la actualización de manera progresiva, apagando un contenedor viejo solo después de encender uno nuevo, manteniendo el sistema **100% activo sin caída del servicio**.

Para habilitar esto en GitHub, debes configurar los siguientes secretos en el repositorio:
- `REGISTRY_USERNAME`: Tu usuario de Docker Hub o credenciales de AWS ECR.
- `REGISTRY_TOKEN`: Tu token de acceso al registro.
- `AWS_EC2_SSH_KEY`: Clave privada SSH (`.pem`) para conectarse al EC2 Manager.
- `AWS_MANAGER_HOST`: IP pública de la instancia EC2 Swarm Manager.
- `AWS_SSH_USER`: Usuario SSH de la instancia (ej. `ubuntu` o `ec2-user`).
