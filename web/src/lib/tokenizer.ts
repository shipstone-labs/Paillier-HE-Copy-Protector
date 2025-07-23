import { marked } from 'marked';
import { getEncoding } from 'js-tiktoken';

export class MarkdownTokenizer {
  private encoder: any;
  
  constructor() {
    // Use cl100k_base encoding (same as GPT-3.5 and GPT-4)
    this.encoder = getEncoding('cl100k_base');
  }
  
  /**
   * Convert markdown to plain text by parsing and walking the token tree
   */
  private markdownToText(markdown: string): string {
    // Use marked's lexer to get tokens, then extract text
    const tokens = marked.lexer(markdown);
    
    const extractText = (token: any): string => {
      switch (token.type) {
        case 'heading':
          return token.text + '\n\n';
        case 'paragraph':
          return token.text + '\n\n';
        case 'text':
          return token.text;
        case 'strong':
        case 'em':
        case 'codespan':
          return token.text;
        case 'code':
          return token.text + '\n\n';
        case 'blockquote':
          return token.tokens ? token.tokens.map(extractText).join('') + '\n\n' : token.text + '\n\n';
        case 'list':
          return token.items.map((item: any) => 
            '• ' + (item.tokens ? item.tokens.map(extractText).join('') : item.text)
          ).join('\n') + '\n\n';
        case 'link':
          return token.text;
        case 'image':
          return token.text || '';
        case 'space':
          return '\n';
        default:
          return token.text || '';
      }
    };
    
    return tokens.map(extractText).join('').trim();
  }
  
  /**
   * Tokenize a markdown document
   * @param markdown The markdown content to tokenize
   * @returns Array of token IDs
   */
  tokenize(markdown: string): number[] {
    // Convert markdown to plain text
    const plainText = this.markdownToText(markdown);
    
    // Encode to tokens
    const tokens = this.encoder.encode(plainText);
    
    return Array.from(tokens);
  }
  
  /**
   * Get token count without returning tokens
   * @param markdown The markdown content
   * @returns Number of tokens
   */
  countTokens(markdown: string): number {
    const plainText = this.markdownToText(markdown);
    return this.encoder.encode(plainText).length;
  }
  
  /**
   * Decode tokens back to text (useful for debugging)
   * @param tokens Array of token IDs
   * @returns Decoded text
   */
  decode(tokens: number[]): string {
    return this.encoder.decode(new Uint32Array(tokens));
  }
  
  /**
   * Free the encoder resources
   */
  destroy() {
    this.encoder.free();
  }
}