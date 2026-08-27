const fs=require("fs"),cp=require("child_process");
const files=["server.js","app.js","index.html","style.css","package.json",".env.example",".gitignore"];
for(const f of files)if(!fs.existsSync(f))throw new Error("Missing "+f);
cp.execFileSync(process.execPath,["--check","server.js"],{stdio:"inherit"});
const p=JSON.parse(fs.readFileSync("package.json","utf8"));for(const d of ["express","better-sqlite3","ws","dotenv","google-auth-library"])if(!p.dependencies[d])throw new Error("Missing dependency "+d);
console.log("PFC FINAL SMOKE TEST: OK");
