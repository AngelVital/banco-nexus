/**
 * Algoritmo del Número de Cuenta según las especificaciones del Proyecto Final.
 */

/**
 * Genera un número de cuenta único de 10 dígitos.
 * @param {number|string} sequentialId ID secuencial de la base de datos.
 * @returns {string} Número de cuenta de 10 dígitos.
 */
function generateAccountNumber(sequentialId) {
  const prefix = "180";
  // Rellena el ID secuencial a 6 dígitos (ej: 34 -> "000034")
  const sequentialStr = String(sequentialId).padStart(6, '0');
  
  // Concatenación Base (9 dígitos)
  const base = prefix + sequentialStr;
  
  // Suma de los 9 dígitos individuales
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += parseInt(base[i], 10);
  }
  
  // Cálculo de Módulo 10
  const remainder = sum % 10;
  const checkDigit = remainder === 0 ? 0 : remainder;
  
  // Consolidación final (10 dígitos)
  return base + String(checkDigit);
}

/**
 * Valida si un número de cuenta cumple con el formato regex de 10 dígitos y es estructuralmente válido.
 * @param {string} accountNumber Número de cuenta a validar.
 * @returns {boolean} True si es válido, False en caso contrario.
 */
function isValidAccountNumber(accountNumber) {
  // 1. Validación estricta con expresión regular
  const regex = /^\d{10}$/;
  if (!regex.test(accountNumber)) {
    return false;
  }
  
  // 2. Validación de Prefijo de Origen
  if (!accountNumber.startsWith("180")) {
    return false;
  }
  
  // 3. Validación de Dígito Verificador (para asegurar integridad)
  const base = accountNumber.substring(0, 9);
  const checkDigit = parseInt(accountNumber.charAt(9), 10);
  
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += parseInt(base[i], 10);
  }
  
  const calculatedRemainder = sum % 10;
  const calculatedCheckDigit = calculatedRemainder === 0 ? 0 : calculatedRemainder;
  
  return checkDigit === calculatedCheckDigit;
}

module.exports = {
  generateAccountNumber,
  isValidAccountNumber
};
