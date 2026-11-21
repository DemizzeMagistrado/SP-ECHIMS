export function ageDescription(dob: string) {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00Z`);
  if (isNaN(birth.getTime())) return "—";
  const now = new Date();
  const months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0);
  if (months < 0) return "Not yet born";
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder ? `${years} y ${remainder} mo` : `${years} years`;
}
export function classificationForDob(dob: string) {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00Z`);
  if (isNaN(birth.getTime())) return "—";
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000);
  const now = new Date();
  const months =
    (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    birth.getUTCMonth() -
    (now.getUTCDate() < birth.getUTCDate() ? 1 : 0);
  if (days < 0) return "—";
  if (days <= 28) return "Newborn (0-28 days)";
  if (months < 12) return "Infant (0-1 y/o)";
  if (months <= 59) return "PSAC (1-4 y/o)";
  return "Out of 0-59 months range";
}
