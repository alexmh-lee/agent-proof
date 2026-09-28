const directory = {
  keys: [
    {
      kty: "OKP",
      crv: "Ed25519",
      x: "xXsYx3DYkQTI5gXXLHw3SA-v6gdJINtdyPaPxZO_XrQ",
      kid: "ZMAe8LHEPuxRsPoFaLFQ6WvJKf0NDbUX3sbGYsodW54",
      alg: "EdDSA",
      use: "sig",
    },
  ],
};

export function GET() {
  return Response.json(directory, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Type": "application/http-message-signatures-directory+json",
    },
  });
}
