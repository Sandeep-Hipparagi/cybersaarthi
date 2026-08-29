export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      shortCircuit: true,
      url: "data:text/javascript,export const env = globalThis.__CYBERSAARTHI_TEST_ENV__ || {};",
    };
  }
  return nextResolve(specifier, context);
}
