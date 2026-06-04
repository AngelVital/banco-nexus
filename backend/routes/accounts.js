const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const { isValidAccountNumber } = require('../utils/account');

/**
 * Helper para registrar en la bitácora de auditoría de forma aislada
 */
async function logAuditEvent(userId, action, status, detail) {
  try {
    await db.pool.query(
      'INSERT INTO event_logs (user_id, action, status, detail) VALUES ($1, $2, $3, $4)',
      [userId, action, status, JSON.stringify(detail)]
    );
  } catch (err) {
    console.error('Error al guardar log de auditoría:', err);
  }
}

// @route   GET api/accounts/profile
// @desc    Obtener perfil de usuario y saldo actual
// @access  Private
router.get('/profile', auth, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, name, email, account_number, balance, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Error al obtener los datos del perfil' });
  }
});

// @route   GET api/accounts/transactions
// @desc    Obtener historial de transacciones (abonos y cargos)
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  const account_number = req.user.account_number;

  try {
    // Busca transacciones donde el usuario sea el origen (cargo) o el destino (abono)
    // Ordenadas por fecha descendente (cronológica)
    const txResult = await db.query(
      `SELECT id, source_account, destination_account, amount, concept, created_at,
       CASE WHEN source_account = $1 THEN 'debit' ELSE 'credit' END as type
       FROM transactions
       WHERE source_account = $1 OR destination_account = $1
       ORDER BY created_at DESC`,
      [account_number]
    );

    res.json(txResult.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Error al obtener el historial de transacciones' });
  }
});

// @route   GET api/accounts/contacts
// @desc    Obtener lista de cuentas destino guardadas
// @access  Private
router.get('/contacts', auth, async (req, res) => {
  try {
    const contactsResult = await db.query(
      `SELECT r.id, r.account_number, r.alias, r.created_at, u.name as contact_name
       FROM recipients r
       LEFT JOIN users u ON r.account_number = u.account_number
       WHERE r.user_id = $1
       ORDER BY r.alias ASC`,
      [req.user.id]
    );

    res.json(contactsResult.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Error al obtener la lista de contactos' });
  }
});

// @route   POST api/accounts/contacts
// @desc    Registrar cuenta de un tercero (agregar contacto)
// @access  Private
router.post('/contacts', auth, async (req, res) => {
  const { account_number, alias } = req.body;
  const user_id = req.user.id;

  if (!account_number || !alias) {
    return res.status(400).json({ message: 'Por favor, ingrese número de cuenta y alias' });
  }

  // Validar formato del número de cuenta destino mediante la regex
  if (!isValidAccountNumber(account_number)) {
    return res.status(400).json({ message: 'El número de cuenta no tiene un formato válido' });
  }

  // Prevenir agregarse a sí mismo
  if (account_number === req.user.account_number) {
    return res.status(400).json({ message: 'No puedes agregarte a ti mismo como contacto' });
  }

  try {
    // Verificar si la cuenta destino existe en el banco
    const userExists = await db.query(
      'SELECT id, name FROM users WHERE account_number = $1',
      [account_number]
    );

    if (userExists.rows.length === 0) {
      return res.status(404).json({ message: 'La cuenta destino no está registrada en el sistema' });
    }

    // Verificar si ya está en la lista de contactos del usuario
    const contactExists = await db.query(
      'SELECT id FROM recipients WHERE user_id = $1 AND account_number = $2',
      [user_id, account_number]
    );

    if (contactExists.rows.length > 0) {
      return res.status(400).json({ message: 'Esta cuenta ya se encuentra registrada en tus contactos' });
    }

    // Insertar contacto en recipients
    const newContactResult = await db.query(
      'INSERT INTO recipients (user_id, account_number, alias) VALUES ($1, $2, $3) RETURNING id, account_number, alias, created_at',
      [user_id, account_number, alias]
    );

    const contact = newContactResult.rows[0];

    // Registrar en auditoría
    await logAuditEvent(user_id, 'add_contact', 'success', {
      contact_id: contact.id,
      account_number: contact.account_number,
      alias: contact.alias,
      contact_name: userExists.rows[0].name
    });

    res.status(201).json({
      message: 'Contacto agregado con éxito',
      contact: {
        ...contact,
        contact_name: userExists.rows[0].name
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Error en el servidor al guardar el contacto' });
  }
});

module.exports = router;
