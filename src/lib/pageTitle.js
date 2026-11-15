// "Sign in · Airport Assist Ghana": a title per page, so browser tabs, history and screen readers say where you are.
export function pageTitle(title, businessName) {
  const name = (businessName || "").trim() || "Airport Assist Ghana";
  return title ? `${title} · ${name}` : name;
}
