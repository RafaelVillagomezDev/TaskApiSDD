export interface GraceTokens {
  accessToken: string;
  refreshToken: string;
}

// Puerto de cifrado de la copia de los tokens de la última rotación, para el margen de gracia (RF-13, D-1)
export interface GraceTokenCipher {
  seal(tokens: GraceTokens): string;
  // Lanza un error si el texto se ha alterado o se cifró con otra clave
  open(sealed: string): GraceTokens;
}
