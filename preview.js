// Local-only visual QA (no Cloudinary/Make). Usage: node preview.js <contentDate> <theme>
const fs=require('fs'),path=require('path'),os=require('os'),{chromium}=require('playwright');
const date=process.argv[2], theme=process.argv[3]||'t-ink', layout=process.argv[4]||content_layout();
function content_layout(){try{return JSON.parse(fs.readFileSync(path.join(__dirname,'content',process.argv[2]+'.json'),'utf8')).layout||'card';}catch(_){return 'card';}}
const tpl=fs.readFileSync(path.join(__dirname,'carousel.html'),'utf8');
const content=JSON.parse(fs.readFileSync(path.join(__dirname,'content',date+'.json'),'utf8'));
content.theme=theme;content.layout=layout;
const dataJson=JSON.stringify({theme:content.theme,layout:content.layout,bg:content.bg,bgreal:content.bgreal,brand:content.brand,slides:content.slides});
const html=tpl.replace(/<script id="data" type="application\/json">[\s\S]*?<\/script>/,'<script id="data" type="application/json">'+dataJson.replace(/<\//g,'<\\/')+'</script>');
const tmp=path.join(os.tmpdir(),'prev-'+theme+'.html'); fs.writeFileSync(tmp,html);
(async()=>{
  const outDir=path.join(__dirname,'preview',theme+'-'+layout); fs.mkdirSync(outDir,{recursive:true});
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
  await p.goto('file://'+tmp,{waitUntil:'networkidle'});
  await p.evaluate(async()=>{await document.fonts.ready;}); await p.waitForTimeout(600);
  for(let i=1;i<=7;i++){await p.locator('#s'+i).screenshot({path:path.join(outDir,'s'+i+'.png')});}
  await b.close(); console.log('done',outDir);
})();
