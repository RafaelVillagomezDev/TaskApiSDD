const DAY_MS = 24 * 60 * 60 * 1000;
const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;

// Día de calendario sin hora ni zona horaria (AAAA-MM-DD)
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  // Devuelve null si el texto no es un día de calendario válido
  static tryParse(value: string): LocalDate | null {
    const match = FORMAT.exec(value);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const candidate = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC desborda los días inexistentes (2026-02-30 → 2026-03-02); se detecta comparando
    if (
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      return null;
    }
    return new LocalDate(year, month, day);
  }

  static parse(value: string): LocalDate {
    const date = LocalDate.tryParse(value);
    if (!date) throw new Error(`Día no válido: "${value}"`);
    return date;
  }

  // Usa los componentes UTC de un Date (columnas DATE de PostgreSQL)
  static fromUtcDate(date: Date): LocalDate {
    return new LocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  toUtcDate(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day));
  }

  toString(): string {
    const month = String(this.month).padStart(2, '0');
    const day = String(this.day).padStart(2, '0');
    return `${this.year}-${month}-${day}`;
  }

  toJSON(): string {
    return this.toString();
  }

  addDays(days: number): LocalDate {
    return LocalDate.fromUtcDate(new Date(this.toUtcDate().getTime() + days * DAY_MS));
  }

  // Días transcurridos desde `other` (positivo si este día es posterior)
  daysSince(other: LocalDate): number {
    return Math.round((this.toUtcDate().getTime() - other.toUtcDate().getTime()) / DAY_MS);
  }

  compare(other: LocalDate): number {
    return Math.sign(this.daysSince(other));
  }

  equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  // Día de la semana ISO: 1 = lunes … 7 = domingo
  dayOfWeek(): number {
    const weekday = this.toUtcDate().getUTCDay();
    return weekday === 0 ? 7 : weekday;
  }

  // Lunes de la semana de este día
  startOfWeek(): LocalDate {
    return this.addDays(1 - this.dayOfWeek());
  }

  startOfMonth(): LocalDate {
    return new LocalDate(this.year, this.month, 1);
  }

  endOfMonth(): LocalDate {
    return LocalDate.fromUtcDate(new Date(Date.UTC(this.year, this.month, 0)));
  }
}
