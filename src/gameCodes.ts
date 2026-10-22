const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

export function generateCode() {
  let code = ''
  const randomValues = new Uint8Array(20)

  while (code.length < CODE_LENGTH) {
    crypto.getRandomValues(randomValues)
    for (const value of randomValues) {
      if (value < 224) code += CODE_ALPHABET[value % CODE_ALPHABET.length]
      if (code.length === CODE_LENGTH) break
    }
  }

  return code
}
