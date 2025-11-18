/**
 * Hello World Example - TypeScript
 * 
 * This file demonstrates how the LLM Assistant can read TypeScript files.
 * Try: /read examples/hello.ts
 */

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function add(a: number, b: number): number {
  return a + b;
}

// Usage
console.log(greet("World"));
console.log(`5 + 3 = ${add(5, 3)}`);
