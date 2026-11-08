import {
 BlockNoteSchema, combineByGroup, createHeadingBlockSpec,
 defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs
} from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import {
 createReactMathBlockSpec,createReactInlineMathSpec,getMathSlashMenuItems
} from '@blocknote/math-block';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import '@blocknote/math-block/style.css';

// Notion-like editing: a simple pair of heading levels, text and code, safe
// hyperlinks and editable LaTeX math (inline or display). No image uploads or
// arbitrary embedded HTML. The server validates this exact content model.
const schema=BlockNoteSchema.create({
 blockSpecs:{
  paragraph:defaultBlockSpecs.paragraph,
  heading:createHeadingBlockSpec({levels:[1,2],allowToggleHeadings:false}),
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
// Existing documents may contain H3-H6 produced before the two-heading UI.
// Show them as H2 instead of refusing to open an otherwise valid draft.
function editorCompatibleBlocks(blocks:unknown[]):unknown[]{
 return blocks.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))return item;
  const row=item as Record<string,unknown>;
  const props=row.props&&typeof row.props==='object'&&!Array.isArray(row.props)?
   row.props as Record<string,unknown>:null;
  const children=Array.isArray(row.children)?editorCompatibleBlocks(row.children):row.children;
  if(row.type==='heading'&&props&&typeof props.level==='number'&&props.level>2)
   return {...row,props:{...props,level:2},children};
  return {...row,children};
 });
}
type EditorProps={
 blocks:unknown[];
 readOnly?:boolean;
 onEdit:(blocks:unknown[],error:string|null)=>void;
};
export function BlockDocumentEditor({blocks,onEdit,readOnly=false}:EditorProps){
 const editor=useCreateBlockNote({
  schema,
  initialContent:(blocks.length?editorCompatibleBlocks(blocks):undefined) as any
 });
 return <BlockNoteView
  editor={editor}
  editable={!readOnly}
  theme="light"
  linkToolbar={true}
  filePanel={false}
  emojiPicker={false}
  slashMenu={false}
  onChange={()=>{
   const current:unknown[]=JSON.parse(JSON.stringify(editor.document));
   // Preserve unfinished content without validating its syntax on each keystroke.
   onEdit(current,null);
  }}
 >
  <SuggestionMenuController
   triggerCharacter="/"
   getItems={async(query)=>filterSuggestionItems(
    combineByGroup(getDefaultReactSlashMenuItems(editor),getMathSlashMenuItems(editor)),
    query
   )}
  />
 </BlockNoteView>;
}
