// Réglages de l'espace client. C'est le seul fichier à modifier.
window.ESPACE_CONFIG = {
  // Supabase > Project Settings > API : « Project URL » et clé « anon public ».
  // La clé « anon » est faite pour être publique : les règles d'accès (supabase/schema.sql) protègent les données.
  // Tant que ces deux champs sont vides, la page affiche « Bientôt disponible ».
  url: "",
  anonKey: "",

  nom: "Anissa Malha",
  nomCourt: "Anissa",
  contact: "anissa.malha.pro@gmail.com",
  confidentialite: "/mentions-legales/#confidentialite",
  delaiValidation: "sous 48 heures ouvrées",
  etapes: ["Diagnostic", "Stratégie", "Déploiement", "Bilan"]
};
