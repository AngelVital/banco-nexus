const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { generateAccountNumber } = require('../utils/account');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_bank_key_12345';

/**
 * Helper para registrar en la bitácora de auditoría de forma segura y aislada (evitando rollback del log)
 */
async function logAuditEvent(userId, action, status, detail) {
  try {
    // Usamos el pool directamente para abrir una conexión independiente y guardar el log
    await db.pool.query(
      'INSERT INTO event_logs (user_id, action, status, detail) VALUES ($1, $2, $3, $4)',
      [userId, action, status, JSON.stringify(detail)]
    );
  } catch (err) {
    console.error('Error al guardar log de auditoría:', err);
  }
}

// @route   POST api/auth/register
// @desc    Registrar nuevo cliente y generar número de cuenta único
// @access  Public
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Validaciones básicas
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Por favor, ingrese todos los campos' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const client = await db.pool.connect();

  try {
    // Iniciamos la transacción ACID para el registro y reserva de ID
    await client.query('BEGIN');

    // 1. Verificar si el email ya existe
    const userExists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      await client.query('ROLLBACK');
      await logAuditEvent(null, 'account_created_failed', 'failed', { email, reason: 'Email ya registrado' });
      return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
    }

    // 2. Obtener el siguiente ID secuencial de la secuencia para calcular el número de cuenta
    const seqResult = await client.query("SELECT nextval('users_id_seq') AS next_id");
    const nextId = parseInt(seqResult.rows[0].next_id, 10);

    // 3. Generar número de cuenta usando la lógica aritmética (Prefijo 180 + ID relleno a 6 dígitos + dígito verificador)
    const accountNumber = generateAccountNumber(nextId);

    // 4. Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 5. Insertar usuario en la base de datos (con saldo inicial de $1000.00 para demostración)
    const initialBalance = 1000.00;
    const insertResult = await client.query(
      'INSERT INTO users (id, name, email, password_hash, account_number, balance) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, account_number, balance',
      [nextId, name, email, passwordHash, accountNumber, initialBalance]
    );

    const newUser = insertResult.rows[0];

    // Confirmamos la transacción
    await client.query('COMMIT');

    // Registramos en la bitácora la creación exitosa
    await logAuditEvent(newUser.id, 'account_created', 'success', {
      account_number: newUser.account_number,
      email: newUser.email,
      name: newUser.name
    });

    // Generar JWT
    const payload = {
      user: {
        id: newUser.id,
        account_number: newUser.account_number
      }
    };

    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '2h' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({
          token,
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            account_number: newUser.account_number,
            balance: newUser.balance
          }
        });
      }
    );

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en registro:', err.message);
    await logAuditEvent(null, 'account_created_failed', 'failed', { email, error: err.message });
    res.status(500).json({ message: 'Error en el servidor al registrar el usuario' });
  } finally {
    client.release();
  }
});

// @route   POST api/auth/login
// @desc    Autenticar usuario y obtener token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, ingrese todos los campos' });
  }

  try {
    // Buscar usuario por correo electrónico
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      await logAuditEvent(null, 'login_failed', 'failed', { email, reason: 'Usuario no existe' });
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAuditEvent(user.id, 'login_failed', 'failed', { email, reason: 'Contraseña incorrecta' });
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    // Registrar inicio de sesión exitoso en la bitácora
    await logAuditEvent(user.id, 'login_success', 'success', { email });

    // Generar JWT
    const payload = {
      user: {
        id: user.id,
        account_number: user.account_number
      }
    };

    jwt.sign(
      payload,
      JWT_SECRET,
      { expiresIn: '2h' },
      (err, token) => {
        if (err) throw err;
        res.json({
          token,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            account_number: user.account_number,
            balance: user.balance
          }
        });
      }
    );

  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ message: 'Error en el servidor al iniciar sesión' });
  }
});

module.exports = router;
