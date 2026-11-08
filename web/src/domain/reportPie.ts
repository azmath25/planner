// Reports use actual saved period data, not demo numbers.
export type PieInput={label:string;value:number};
export type PieSlice=PieInput&{color:string;start:number;end:number;percentage:number};
export type PieModel={total:number;segments:PieSlice[]};
const COLORS=['#327d70','#b386cf','#df9860','#6b9dc7','#c7b65e','#cd7e91','#6f9a81','#8c8bba'];
export function pieSegments(rows:PieInput[],{limit=7}:{limit?:number}={}):PieModel{
 const clean=rows.filter(r=>Number.isFinite(r.value)&&r.value>0)
  .map(r=>({label:String(r.label),value:r.value}))
  .sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
 const top=clean.slice(0,limit);
 if(clean.length>limit)top.push({label:'Other',value:clean.slice(limit).reduce((sum,r)=>sum+r.value,0)});
 const total=clean.reduce((sum,r)=>sum+r.value,0);
 let degrees=0;
 return {total,segments:top.map((r,i)=>{
   const start=degrees;
   degrees+=r.value/total*360;
   return {...r,color:COLORS[i%COLORS.length]!,start,end:degrees,
    percentage:Math.round(r.value/total*1000)/10};
 })};
}
export function pieGradient(pie:PieModel):string{
 if(!pie.total||!pie.segments.length)return '#d9e4df';
 return 'conic-gradient('+pie.segments.map(s=>
  s.color+' '+s.start.toFixed(3)+'deg '+s.end.toFixed(3)+'deg').join(',')+')';
}
