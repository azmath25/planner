import {
 BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs
} from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { assertDocumentBlocks } from '../domain/documentBlocks';

// Restrict editor controls to what the M6.2a backend accepts. Media, tables,
// embedded URLs and links have no server-side upload/storage policy yet.
const schema=BlockNoteSchema.create({
 blockSpecs:{
  paragraph:defaultBlockSpecs.paragraph,
  heading:defaultBlockSpecs.heading,
  bulletListItem:defaultBlockSpecs.bulletListItem,
  numberedListItem:defaultBlockSpecs.numberedListItem,
  checkListItem:defaultBlockSpecs.checkListItem,
  codeBlock:defaultBlockSpecs.codeBlock
 },
 inlineContentSpecs:{text:defaultInlineContentSpecs.text},
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
type EditorProps={
 blocks:unknown[];
 readOnly?:boolean;
 onEdit:(blocks:unknown[],error:string|null)=>void;
};
export function BlockDocumentEditor({blocks,onEdit,readOnly=false}:EditorProps){
 // Types are rechecked at the browser boundary and again by the server.
 // The cast is limited to the BlockNote JSON interchange boundary.
 const editor=useCreateBlockNote({
  schema,
  initialContent:(blocks.length?blocks:undefined) as any
 });
 return <BlockNoteView
  editor={editor}
  editable={!readOnly}
  theme="light"
  linkToolbar={false}
  filePanel={false}
  emojiPicker={false}
  onChange={()=>{
   const current:unknown[]=JSON.parse(JSON.stringify(editor.document));
   try{assertDocumentBlocks(current);onEdit(current,null);}
   catch(error){
    onEdit(current,error instanceof Error?error.message:'Unsupported document content');
   }
  }}
 />;
}
