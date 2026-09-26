const { join } = require("node:path");
const { GlobalFonts, createCanvas } = require("@napi-rs/canvas");
let ready = false;
function ensureFonts() {
  if (ready) return;
  for (const weight of ["Regular", "Bold"]) {
    const file = join(
      __dirname,
      "../../assets/fonts",
      `NotoSans-${weight}.ttf`,
    );
    if (!GlobalFonts.registerFromPath(file, "Kagetsu Sans"))
      throw new Error(`Fonte obrigatória ausente ou inválida: ${file}`);
  }
  if (
    !GlobalFonts.registerFromPath(
      join(__dirname, "../../assets/fonts/NotoEmoji.ttf"),
      "Kagetsu Emoji",
    )
  )
    throw new Error("Fonte de emoji ausente ou inválida.");
  const ctx = createCanvas(300, 70).getContext("2d");
  ctx.font = '24px "Kagetsu Sans"';
  ctx.fillText("Kagetsu Nível 123 XP", 4, 40);
  if (
    ctx.measureText("Kagetsu").width < 20 ||
    !ctx.getImageData(0, 0, 300, 70).data.some((v, i) => i % 4 === 3 && v)
  )
    throw new Error("Falha ao renderizar texto com as fontes empacotadas.");
  ready = true;
}
module.exports = { ensureFonts };
