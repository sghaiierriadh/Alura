/**
 * pdf.js (via pdf-parse) s’appuie sur l’API DOM côté navigateur ; en milieu
 * Node (ex. Vercel), DOMMatrix n’existe pas par défaut.
 * Doit être importé **avant** toute importation de `pdf-parse` (ordre d’exécution
 * des modules = ordre des imports).
 */
if (typeof window === "undefined") {
  // @ts-ignore
  global.DOMMatrix = class DOMMatrix {
    constructor() {}
  };
}

export {};
