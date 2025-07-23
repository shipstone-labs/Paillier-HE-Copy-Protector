// Tokenizer Library Comparison

// 1. marked + js-tiktoken
// Input: "# Hello World\nThis is a **test** document."
// marked output: HTML string or AST tokens
// js-tiktoken output: [1234, 5678, 9012, ...] (OpenAI token IDs)

// 2. remark + natural
// Input: "# Hello World\nThis is a **test** document."
// remark output: AST tree with node types (heading, paragraph, strong, text)
// natural output: ["Hello", "World", "This", "is", "a", "test", "document"]

// 3. markdown-wasm
// Input: "# Hello World\nThis is a **test** document."
// Output: HTML string "<h1>Hello World</h1><p>This is a <strong>test</strong> document.</p>"
// Note: Only provides HTML, would need additional parsing for tokens

// 4. Simple custom approach
// Input: "# Hello World\nThis is a **test** document."
// Output: ["hello", "world", "this", "is", "a", "test", "document"]

export const comparisons = {
  "marked + js-tiktoken": {
    pros: [
      "OpenAI-compatible tokenization",
      "Consistent token IDs across documents",
      "Good for ML/AI applications"
    ],
    cons: [
      "Larger bundle size (~100KB for tiktoken)",
      "Token IDs not human-readable",
      "May be overkill for simple comparison"
    ],
    output: "Array of token IDs: [1234, 5678, ...]"
  },
  
  "remark + natural": {
    pros: [
      "Full AST access for advanced processing",
      "Linguistic features (stemming, POS tagging)",
      "Extensible plugin system"
    ],
    cons: [
      "Heaviest option (~200KB+)",
      "Complex setup",
      "Slower performance"
    ],
    output: "Word tokens with optional linguistic data"
  },
  
  "markdown-wasm": {
    pros: [
      "Fastest parsing (WASM performance)",
      "Small size (~30KB)",
      "Battle-tested parser"
    ],
    cons: [
      "Only outputs HTML",
      "Need secondary step to extract text/tokens",
      "No direct tokenization support"
    ],
    output: "HTML string only"
  }
};