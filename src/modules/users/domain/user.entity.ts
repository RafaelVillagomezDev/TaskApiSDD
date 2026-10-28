// Límites de una cuenta (RF-02, RF-04, RF-05); los aplican los schemas Zod de entrada
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 100;

export interface UserProps {
  id: string;
  // Recortado y en minúsculas (RF-03)
  email: string;
  name: string | null;
  // Cadena PHC de Argon2id; nunca la contraseña (RNF-03)
  passwordHash: string;
  createdAt: Date;
}

// Datos para crear una cuenta
export interface NewUser {
  email: string;
  name: string | null;
  passwordHash: string;
}

// Nombre recortado; vacío o solo espacios → null (RF-05)
function normalizeName(name: string | null): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

// Cuenta de usuario (spec 002)
export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    return new User({ ...props, createdAt: new Date(props.createdAt) });
  }

  // Cambia el nombre visible (RF-26)
  rename(name: string | null): void {
    this.props.name = normalizeName(name);
  }

  // Sustituye la huella tras un cambio de contraseña (RF-27)
  changePasswordHash(passwordHash: string): void {
    this.props.passwordHash = passwordHash;
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string | null {
    return this.props.name;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
}
