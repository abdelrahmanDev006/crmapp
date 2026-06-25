const XlsxPopulate = require("xlsx-populate");

async function test() {
  try {
    const workbook = await XlsxPopulate.fromBlankAsync();
    workbook.sheet(0).cell("A1").value("Hello World");
    
    await workbook.toFileAsync("test.xlsx", { password: "CRM@Export2026#Secure" });
    console.log("Success");
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
