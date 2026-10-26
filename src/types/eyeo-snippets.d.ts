// @eyeo/snippets ships plain JavaScript. Each world's export is a
// self-contained function meant for chrome.scripting.executeScript, called as
// `world(environment, ...[name, ...args])`, with a `.has(name)` lookup.

interface SnippetWorld {
  (environment: { world: 'MAIN' | 'ISOLATED' }, ...calls: string[][]): void;
  has(name: string): boolean;
}

declare module '@eyeo/snippets/main' {
  const main: SnippetWorld;
  export default main;
}

declare module '@eyeo/snippets/isolated/lite' {
  const isolated: SnippetWorld;
  export default isolated;
}
