// JWK members that contain private or symmetric key material (RFC 7518 §6,
// RFC 8037 §2). This intentionally scans the entire request, not just the
// declared public-key field.
export const PRIVATE_JWK_MEMBERS = [
  "d",
  "p",
  "q",
  "dp",
  "dq",
  "qi",
  "oth",
  "k",
];

const PEM_PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export function findPrivateKeyMaterial(
  value: unknown,
  path = "$",
): string[] {
  if (typeof value === "string") {
    return PEM_PRIVATE_KEY.test(value) ? [path] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findPrivateKeyMaterial(item, `${path}[${index}]`),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => {
      const childPath = `${path}.${key}`;
      const hits = PRIVATE_JWK_MEMBERS.includes(key) ? [childPath] : [];
      return [...hits, ...findPrivateKeyMaterial(child, childPath)];
    });
  }

  return [];
}
