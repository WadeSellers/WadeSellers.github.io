// Supabase connection.
//
// This key is the *publishable* one. It is meant to sit in public source and
// ship to every visitor's browser. What protects the data is the row-level
// security policy on the table (read and append only, no edit, no delete),
// not secrecy. See docs/backend-setup.md.
window.WS_CONFIG = {
  supabaseUrl: "https://ggoniotuqcbojrvwllix.supabase.co",
  supabaseKey: "sb_publishable_FDdC1uvvJIv1oFrKpTr3Dg_U-nwZP2M",

  // How long a stroke stays on the wall before it fades out of the query.
  wallHours: 24,

  // Most recent strokes to pull when the wall opens.
  wallLimit: 300
};
