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

// @route   POST api/transfers
// @desc    Ejecutar transferencia bancaria con transacciones ACID y bloqueo de filas (FOR UPDATE)
// @access  Private
router.post('/', auth, async (req, res) => {
  const { destination_account, amount, concept } = req.body;
  const source_account = req.user.account_number;
  const user_id = req.user.id;

  // 1. Validar campos requeridos
  if (!destination_account || !amount || !concept) {
    return res.status(400).json({ message: 'Por favor, ingrese cuenta destino, monto y concepto' });
  }

  // 2. Validar que el monto sea positivo y válido
  const transferAmount = parseFloat(amount);
  if (isNaN(transferAmount) || transferAmount <= 0) {
    return res.status(400).json({ message: 'El monto a transferir debe ser un número mayor a cero' });
  }

  // 3. Validar longitud y formato de cuenta destino usando la regex solicitada en el PDF (/^\d{10}$/)
  if (!isValidAccountNumber(destination_account)) {
    await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
      source_account,
      destination_account,
      amount: transferAmount,
      reason: 'Formato o dígito verificador de cuenta destino inválido'
    });
    return res.status(400).json({ message: 'El número de cuenta destino es inválido o no cumple las especificaciones' });
  }

  // 4. Prevenir transferencia a uno mismo
  if (source_account === destination_account) {
    await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
      source_account,
      destination_account,
      amount: transferAmount,
      reason: 'Cuenta origen y destino son iguales'
    });
    return res.status(400).json({ message: 'No puedes transferir fondos a tu propia cuenta' });
  }

  // Obtener un cliente de la conexión pool para manejar la transacción ACID
  const client = await db.pool.connect();

  try {
    // INICIAR TRANSACCIÓN ACID
    await client.query('BEGIN');

    // 5. Bloquear y verificar saldo de la cuenta origen (SELECT ... FOR UPDATE)
    // El FOR UPDATE bloquea la fila del remitente evitando que otras transacciones paralelas retiren fondos al mismo tiempo
    const sourceUserResult = await client.query(
      'SELECT id, balance FROM users WHERE account_number = $1 FOR UPDATE',
      [source_account]
    );

    if (sourceUserResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
        source_account,
        destination_account,
        amount: transferAmount,
        reason: 'Cuenta de origen no encontrada en el sistema'
      });
      return res.status(404).json({ message: 'Cuenta origen no encontrada' });
    }

    const currentBalance = parseFloat(sourceUserResult.rows[0].balance);

    // 6. Validar que la cuenta origen tenga fondos suficientes
    if (currentBalance < transferAmount) {
      await client.query('ROLLBACK');
      await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
        source_account,
        destination_account,
        amount: transferAmount,
        reason: 'Fondos insuficientes',
        current_balance: currentBalance
      });
      return res.status(400).json({ message: 'Fondos insuficientes para completar la transferencia' });
    }

    // 7. Bloquear y verificar la cuenta destino
    const destUserResult = await client.query(
      'SELECT id, balance FROM users WHERE account_number = $1 FOR UPDATE',
      [destination_account]
    );

    if (destUserResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
        source_account,
        destination_account,
        amount: transferAmount,
        reason: 'La cuenta destino no existe'
      });
      return res.status(404).json({ message: 'La cuenta destino especificada no existe en el sistema' });
    }

    // 8. Restar saldo a la cuenta A
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE account_number = $2',
      [transferAmount, source_account]
    );

    // 9. Sumar saldo a la cuenta B
    await client.query(
      'UPDATE users SET balance = balance + $1 WHERE account_number = $2',
      [transferAmount, destination_account]
    );

    // 10. Registrar la transacción en el historial
    const transInsertResult = await client.query(
      'INSERT INTO transactions (source_account, destination_account, amount, concept) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      [source_account, destination_account, transferAmount, concept]
    );

    const transactionId = transInsertResult.rows[0].id;
    const createdAt = transInsertResult.rows[0].created_at;

    // COMMIT DE LA TRANSACCIÓN ACID
    await client.query('COMMIT');

    // Registrar en la bitácora la transferencia exitosa (auditoría interna)
    await logAuditEvent(user_id, 'transfer_approved', 'success', {
      transaction_id: transactionId,
      source_account,
      destination_account,
      amount: transferAmount,
      concept
    });

    // Enviar confirmación al frontend
    res.json({
      message: 'Transferencia realizada con éxito',
      transaction: {
        id: transactionId,
        source_account,
        destination_account,
        amount: transferAmount,
        concept,
        created_at: createdAt
      }
    });

  } catch (err) {
    // Si ocurre un error inesperado, revertimos los cambios para mantener consistencia absoluta
    await client.query('ROLLBACK');
    console.error('Error durante la transacción de transferencia:', err.message);
    
    await logAuditEvent(user_id, 'transfer_rejected', 'failed', {
      source_account,
      destination_account,
      amount: transferAmount,
      reason: 'Error interno en la base de datos',
      error: err.message
    });

    res.status(500).json({ message: 'Error en el servidor al procesar la transferencia bancaria' });
  } finally {
    // Liberar el cliente al pool
    client.release();
  }
});

module.exports = router;
