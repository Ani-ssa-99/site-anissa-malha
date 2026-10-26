export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  eleventyConfig.addCollection("articles", (api) =>
    api.getFilteredByGlob("src/blog/*.md").sort((a, b) => b.date - a.date)
  );

  const mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  eleventyConfig.addFilter("dateFr", (d) => {
    const x = new Date(d);
    return `${x.getDate()} ${mois[x.getMonth()]} ${x.getFullYear()}`;
  });
  // "*mot*" dans un titre devient le mot en italique couleur accent
  eleventyConfig.addFilter("accent", (txt = "") => {
    const esc = String(txt).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc.replace(/\*(.+?)\*/g, "<em>$1</em>");
  });
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
