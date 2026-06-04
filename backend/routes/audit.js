const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// @route   GET api/audit
// @desc    Obtener bitácora de eventos de auditoría (logs) relacionados con el usuario
// @access  Private
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  const accountNumber = req.user.account_number;

  try {
    // Busca logs de eventos del usuario por su ID, o donde su cuenta esté involucrada en los detalles de una transferencia
    const auditLogs = await db.query(
      `SELECT id, timestamp, user_id, action, status, detail
       FROM event_logs
       WHERE user_id = $1
          OR (detail->>'source_account' = $2)
          OR (detail->>'destination_account' = $2)
       ORDER BY timestamp DESC
       LIMIT 50`,
      [userId, accountNumber]
    );

    res.json(auditLogs.rows);
  } catch (err) {
    console.error('Error al obtener bitácora:', err.message);
    res.status(500).json({ message: 'Error en el servidor al obtener los registros de auditoría' });
  }
});

module.exports = router;
