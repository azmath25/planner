import {
 BlockNoteSchema, combineByGroup, createHeadingBlockSpec,
 defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs
} from '@blocknote/core';
import { filterSuggestionItems,insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import {
 createReactMathBlockSpec,createReactInlineMathSpec,getMathSlashMenuItems
} from '@blocknote/math-block';
import { BlockNoteView } from '@blocknote/mantine';
import { safeDocumentLink } from '../domain/documentBlocks';
import { documentPageUrl,linkedDocumentId } from '../domain/documentPageLinks';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@blocknote/math-block/style.css';

// Match the server's strict allow-list. Links and page references are normal,
// revisioned BlockNote content; unsafe HTML/iframes are never persisted.
const schema=BlockNoteSchema.create({
 blockSpecs:{
  paragraph:defaultBlockSpecs.paragraph,
  heading:createHeadingBlockSpec({levels:[1,2,3],allowToggleHeadings:false}),
  bulletListItem:defaultBlockSpecs.bulletListItem,
  numberedListItem:defaultBlockSpecs.numberedListItem,
  checkListItem:defaultBlockSpecs.checkListItem,
  codeBlock:defaultBlockSpecs.codeBlock,
  mathBlock:createReactMathBlockSpec()
 },
 inlineContentSpecs:{
  text:defaultInlineContentSpecs.text,
  link:defaultInlineContentSpecs.link,
  math:createReactInlineMathSpec()
 },
 styleSpecs:{
  bold:defaultStyleSpecs.bold,
  italic:defaultStyleSpecs.italic,
  underline:defaultStyleSpecs.underline,
  strike:defaultStyleSpecs.strike,
  code:defaultStyleSpecs.code,
  textColor:defaultStyleSpecs.textColor,
  backgroundColor:defaultStyleSpecs.backgroundColor
 }
});
// Older H4–H6 documents remain readable in the H1–H3 editing schema.
function editorCompatibleBlocks(blocks:unknown[]):unknown[]{
 return blocks.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return item;
  const row=item as Record<string,unknown>;
  const props=row.props&&typeof row.props==='object'&&!Array.isArray(row.props)?
   row.props as Record<string,unknown>:null;
  const children=Array.isArray(row.children)?editorCompatibleBlocks(row.children):row.children;
  if(row.type==='heading'&&props&&typeof props.level==='number'&&props.level>3)
   return {...row,props:{...props,level:3},children};
  return {...row,children};
 });
}
type PageSummary={id:string;title:string};
type EditorProps={
 blocks:unknown[];
 readOnly?:boolean;
 pages?:PageSummary[];
 onEdit:(blocks:unknown[],error:string|null)=>void;
 onCreateChild?:(title:string)=>Promise<PageSummary|null>;
 onOpenPage?:(id:string)=>void;
};
export function BlockDocumentEditor({
 blocks,onEdit,readOnly=false,pages=[],onCreateChild,onOpenPage
}:EditorProps){
 const editor=useCreateBlockNote({
  schema,
  initialContent:(blocks.length?editorCompatibleBlocks(blocks):undefined) as any
 });
 // Custom slash actions use the supported default content schema, so existing
 // server validation, autosave, backup and HTML export work unchanged.
 const insertPageLink=(page:PageSummary,anchorId?:string)=>{
  const content=[
   {type:'text' as const,text:'↳ ',styles:{}},
   {type:'link' as const,href:documentPageUrl(page.id,window.location.href),
    content:[{type:'text' as const,text:page.title,styles:{}}]}
  ];
  const anchor=anchorId?editor.getBlock(anchorId):undefined;
  if(anchor)editor.insertBlocks([{type:'paragraph',content}],anchor,'after');
  else insertOrUpdateBlockForSlashMenu(editor,{type:'paragraph',content});
 };
 const customItems=(query:string)=>{
  const items=[
   {
    title:'New child page',group:'Pages and links',
    subtext:'Create a private child and insert its link on this line',
    aliases:['subpage','nested page','child','new page'],
    icon:<span aria-hidden="true">↳</span>,
    onItemClick:()=>{
     if(readOnly||!onCreateChild)return;
     const requested=window.prompt('Child page title','Untitled child page');
     if(requested===null)return;
     const name=requested.trim().slice(0,160)||'Untitled child page';
     const anchorId=editor.getTextCursorPosition().block.id;
     void onCreateChild(name).then(page=>{
      if(page)insertPageLink(page,anchorId);
     }).catch(()=>{/* Parent keeps its existing content; host displays the error. */});
    }
   },
   {
    title:'Link existing page',group:'Pages and links',
    subtext:'Insert a clickable line to a document in your library',
    aliases:['page link','internal link','reference document'],
    icon:<span aria-hidden="true">↗</span>,
    onItemClick:()=>{
     if(readOnly||!pages.length)return;
     const wanted=window.prompt('Existing document title');
     if(!wanted?.trim())return;
     const matches=pages.filter(p=>p.title.toLowerCase()===wanted.trim().toLowerCase());
     if(matches.length!==1){
      window.alert(matches.length?'More than one page has that title. Choose a page from the / menu.':
       'No document with that title. Search by typing / followed by the page name.');
      return;
     }
     insertPageLink(matches[0]);
    }
   },
   {
    title:'Insert web link',group:'Pages and links',
    subtext:'Add a safe, clickable HTTP/HTTPS link',
    aliases:['hyperlink','website','url','link'],
    icon:<span aria-hidden="true">🔗</span>,
    onItemClick:()=>{
     if(readOnly)return;
     const href=window.prompt('Website URL (https://...)');
     if(href===null)return;
     if(!safeDocumentLink(href)){
      window.alert('Enter a valid HTTP or HTTPS URL, without credentials.');return;
     }
     const label=window.prompt('Link text',href);
     if(label===null)return;
     insertOrUpdateBlockForSlashMenu(editor,{
      type:'paragraph',content:[{type:'link',href,
       content:[{type:'text',text:(label.trim()||href).slice(0,500),styles:{}}]}]
     });
    }
   }
  ];
  // Searchable direct page results; not a permanent wall of menu items.
  const q=query.toLowerCase().replace(/^page\s*:?\s*/,'').trim();
  if(q.length>=2){
   const results=pages.filter(page=>page.title.toLowerCase().includes(q)).slice(0,10);
   for(const page of results){
    items.push({
     title:'Page: '+page.title.slice(0,100),group:'Existing pages',
     subtext:'Insert internal page link',aliases:[page.title],
     icon:<span aria-hidden="true">▤</span>,
     onItemClick:()=>{if(!readOnly)insertPageLink(page);}
    });
   }
  }
  return items;
 };
 return <div className="df-blocknote-document"
  onClickCapture={event=>{
   const node=event.target;
   if(!(node instanceof Element)||!onOpenPage)return;
   const a=node.closest('a[href]');
   if(!a)return;
   const id=linkedDocumentId(a.getAttribute('href')||'',window.location.href);
   if(id){
    event.preventDefault();event.stopPropagation();onOpenPage(id);
   }
  }}>
  <BlockNoteView
   editor={editor}
   editable={!readOnly}
   theme="light"
   linkToolbar={true}
   filePanel={false}
   emojiPicker={false}
   slashMenu={false}
   onChange={()=>{
    const current:unknown[]=JSON.parse(JSON.stringify(editor.document));
    onEdit(current,null);
   }}
  >
   <SuggestionMenuController
    triggerCharacter="/"
    getItems={async(query)=>filterSuggestionItems(
     [...customItems(query),...combineByGroup(
      getDefaultReactSlashMenuItems(editor),getMathSlashMenuItems(editor))],
     query
    )}
   />
  </BlockNoteView>
 </div>;
}
