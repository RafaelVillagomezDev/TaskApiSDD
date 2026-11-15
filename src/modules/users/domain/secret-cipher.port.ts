// Puerto de cifrado de los secretos que el servidor necesita recuperar: la copia de los tokens del margen de
// gracia (RF-13 de la 002) y la del token CSRF de la sesión (RF-02 de la 003). Solo se abren con la clave
// del servidor (RNF-06 de la 002, RNF-04 de la 003)
export interface SecretCipher {
  seal(plain: string): string;
  // Lanza un error si el texto se ha alterado o se cifró con otra clave
  open(sealed: string): string;
}
