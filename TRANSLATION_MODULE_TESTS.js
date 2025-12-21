/**
 * Translation Module Test Suite
 * Manual tests to verify ChatBridgeTranslator functionality
 * 
 * To run these tests:
 * 1. Load ChatBridge extension in Chrome
 * 2. Open any supported AI platform (ChatGPT, Claude, etc.)
 * 3. Open browser console (F12)
 * 4. Copy and paste test functions
 * 5. Call tests: await testBasicTranslation(), await testDomainDetection(), etc.
 */

// Test 1: Basic String Translation
async function testBasicTranslation() {
  console.log('=== Test 1: Basic String Translation ===');
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'es',
    mode: 'all',
    shorten: false,
    content: 'Hello, how are you today?'
  });
  
  console.log('Original:', 'Hello, how are you today?');
  console.log('Translated:', result.translated);
  console.log('Domain:', result.meta.domain);
  console.log('Expected: "Hola, ¿cómo estás hoy?"');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 2: Conversation Translation (All Messages)
async function testConversationTranslation() {
  console.log('=== Test 2: Conversation Translation ===');
  
  const conversation = [
    { role: 'user', text: 'Can you help me with JavaScript?' },
    { role: 'assistant', text: 'Of course! I\'d be happy to help you with JavaScript. What do you need?' },
    { role: 'user', text: 'I want to learn about async/await' }
  ];
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'fr',
    mode: 'all',
    shorten: false,
    content: conversation
  });
  
  console.log('Original conversation:');
  conversation.forEach(msg => console.log(`  ${msg.role}: ${msg.text}`));
  
  console.log('\nTranslated conversation:');
  result.translated.forEach(msg => console.log(`  ${msg.role}: ${msg.text}`));
  
  console.log('\nMetadata:', result.meta);
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 3: Mode - User Messages Only
async function testUserOnlyMode() {
  console.log('=== Test 3: User Messages Only Mode ===');
  
  const conversation = [
    { role: 'user', text: 'What is machine learning?' },
    { role: 'assistant', text: 'Machine learning is a subset of AI...' },
    { role: 'user', text: 'Can you give me examples?' }
  ];
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'de',
    mode: 'user',  // Only translate user messages
    shorten: false,
    content: conversation
  });
  
  console.log('Original:');
  conversation.forEach(msg => console.log(`  ${msg.role}: ${msg.text}`));
  
  console.log('\nTranslated (user only):');
  result.translated.forEach(msg => console.log(`  ${msg.role}: ${msg.text}`));
  
  console.log('\nExpected: User messages in German, assistant messages unchanged');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 4: Domain Detection - Technical
async function testTechnicalDomain() {
  console.log('=== Test 4: Technical Domain Detection ===');
  
  const technicalText = `
  To deploy the API to production:
  
  1. Build the Docker container
  2. Push to ECR registry
  3. Update the ECS task definition
  4. Deploy to the cluster
  
  The API uses REST endpoints with JSON payloads.
  `;
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'ja',
    mode: 'all',
    shorten: false,
    content: technicalText
  });
  
  console.log('Original:', technicalText);
  console.log('\nTranslated:', result.translated);
  console.log('\nDetected domain:', result.meta.domain);
  console.log('Expected domain: technical');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 5: Code Preservation
async function testCodePreservation() {
  console.log('=== Test 5: Code Block Preservation ===');
  
  const textWithCode = `
Here's how to create a server in Node.js:

\`\`\`javascript
const express = require('express');
const app = express();

app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

app.listen(3000);
\`\`\`

This code starts an Express server on port 3000.
  `;
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'pt',
    mode: 'all',
    shorten: false,
    content: textWithCode
  });
  
  console.log('Original:', textWithCode);
  console.log('\nTranslated:', result.translated);
  console.log('\nExpected: Code block unchanged, surrounding text in Portuguese');
  console.log('Domain:', result.meta.domain);
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 6: Inline Code Preservation
async function testInlineCodePreservation() {
  console.log('=== Test 6: Inline Code Preservation ===');
  
  const text = 'Use the `useState` hook to manage state, and `useEffect` for side effects in React.';
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'ko',
    mode: 'all',
    shorten: false,
    content: text
  });
  
  console.log('Original:', text);
  console.log('Translated:', result.translated);
  console.log('Expected: `useState` and `useEffect` preserved, rest in Korean');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 7: Summarize + Translate
async function testSummarizeAndTranslate() {
  console.log('=== Test 7: Summarize + Translate ===');
  
  const longText = `
  JavaScript is a high-level, interpreted programming language that is one of the core technologies of the World Wide Web. 
  It enables interactive web pages and is an essential part of web applications. The vast majority of websites use it for 
  client-side page behavior, and all major web browsers have a dedicated JavaScript engine to execute it. JavaScript is 
  prototype-based, multi-paradigm, single-threaded, dynamic language, supporting object-oriented, imperative, and declarative 
  styles. It has APIs for working with text, dates, regular expressions, standard data structures, and the Document Object Model.
  Originally designed for client-side scripting, JavaScript is now also used for server-side programming via Node.js.
  `;
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'zh',
    mode: 'all',
    shorten: true,  // Summarize before translating
    content: longText
  });
  
  console.log('Original length:', longText.length);
  console.log('Translated (summarized):', result.translated);
  console.log('Shortened:', result.meta.shortened);
  console.log('Expected: Shorter Chinese summary preserving key facts');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 8: French Typography
async function testFrenchTypography() {
  console.log('=== Test 8: French Typography Rules ===');
  
  const text = 'What is your name? That is amazing!';
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'fr',
    mode: 'all',
    shorten: false,
    content: text
  });
  
  console.log('Original:', text);
  console.log('Translated:', result.translated);
  console.log('Expected: Space before ? and ! (French typography)');
  console.log('Example: "Comment vous appelez-vous ?" not "Comment vous appelez-vous?"');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 9: Spanish Inverted Punctuation
async function testSpanishPunctuation() {
  console.log('=== Test 9: Spanish Inverted Punctuation ===');
  
  const text = 'How are you? That is incredible!';
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'es',
    mode: 'all',
    shorten: false,
    content: text
  });
  
  console.log('Original:', text);
  console.log('Translated:', result.translated);
  console.log('Expected: ¿Cómo estás? ¡Eso es increíble!');
  console.log('Note: Inverted ¿ and ¡ at start of questions/exclamations');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 10: Japanese Full-Width Punctuation
async function testJapanesePunctuation() {
  console.log('=== Test 10: Japanese Full-Width Punctuation ===');
  
  const text = 'Hello. How are you? Thank you!';
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'ja',
    mode: 'all',
    shorten: false,
    content: text
  });
  
  console.log('Original:', text);
  console.log('Translated:', result.translated);
  console.log('Expected: Full-width punctuation 。、?!');
  console.log('Example: "こんにちは。元気ですか?" not "こんにちは.元気ですか?"');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 11: Markdown Preservation
async function testMarkdownPreservation() {
  console.log('=== Test 11: Markdown Preservation ===');
  
  const markdownText = `
# Main Title

This is **bold text** and this is *italic text*.

## Subsection

- First item
- Second item
- Third item

1. Numbered one
2. Numbered two

[Link text](https://example.com)

![Image alt](https://example.com/image.png)
  `;
  
  const result = await ChatBridgeTranslator.translateContent({
    targetLanguage: 'ru',
    mode: 'all',
    shorten: false,
    content: markdownText
  });
  
  console.log('Original:', markdownText);
  console.log('\nTranslated:', result.translated);
  console.log('\nExpected: Headers (#, ##), bold (**), italic (*), lists, links preserved');
  console.log('✓ Test complete\n');
  
  return result;
}

// Test 12: Error Handling - Invalid Language
async function testInvalidLanguage() {
  console.log('=== Test 12: Error Handling - Invalid Language ===');
  
  try {
    await ChatBridgeTranslator.translateContent({
      targetLanguage: 'invalid',
      mode: 'all',
      shorten: false,
      content: 'Test text'
    });
    console.log('❌ Test failed: Should have thrown error');
  } catch (error) {
    console.log('✓ Error caught correctly:', error.message);
    console.log('Expected: "Unsupported target language: invalid"');
  }
  
  console.log('✓ Test complete\n');
}

// Test 13: Error Handling - Invalid Mode
async function testInvalidMode() {
  console.log('=== Test 13: Error Handling - Invalid Mode ===');
  
  try {
    await ChatBridgeTranslator.translateContent({
      targetLanguage: 'en',
      mode: 'invalid_mode',
      shorten: false,
      content: 'Test text'
    });
    console.log('❌ Test failed: Should have thrown error');
  } catch (error) {
    console.log('✓ Error caught correctly:', error.message);
    console.log('Expected: "Invalid translation mode: invalid_mode"');
  }
  
  console.log('✓ Test complete\n');
}

// Test 14: Clean Text Function
function testCleanText() {
  console.log('=== Test 14: Clean Text Function ===');
  
  const dirtyText = `
Hello,um,I want to,like,learn programming.Actually,I think that JavaScript is,you know,pretty cool.
  `;
  
  const cleaned = ChatBridgeTranslator.cleanText(dirtyText);
  
  console.log('Original:', dirtyText);
  console.log('Cleaned:', cleaned);
  console.log('Expected: Filler removed ("um", "like", "you know", "actually", "I think that")');
  console.log('✓ Test complete\n');
}

// Test 15: Domain Detection Function
function testDomainDetection() {
  console.log('=== Test 15: Domain Detection Function ===');
  
  const texts = {
    technical: 'The API uses REST endpoints with JSON payloads and JWT authentication.',
    conversational: 'Hey, how are you doing today? Want to grab coffee later?',
    academic: 'The hypothesis was tested using a peer-reviewed methodology with statistical analysis.',
    instructional: 'Step 1: Open the file. Step 2: Click save. Step 3: Close the application.',
    codeRelated: 'function hello() { console.log("Hello world"); }'
  };
  
  Object.entries(texts).forEach(([expected, text]) => {
    const detected = ChatBridgeTranslator.detectDomain(text);
    const match = detected === expected ? '✓' : '❌';
    console.log(`${match} Text: "${text.substring(0, 50)}..."`);
    console.log(`   Expected: ${expected}, Detected: ${detected}\n`);
  });
  
  console.log('✓ Test complete\n');
}

// Test 16: Get Supported Languages
function testGetSupportedLanguages() {
  console.log('=== Test 16: Get Supported Languages ===');
  
  const languages = ChatBridgeTranslator.getSupportedLanguages();
  
  console.log('Total supported languages:', Object.keys(languages).length);
  console.log('Sample languages:');
  Object.entries(languages).slice(0, 10).forEach(([code, name]) => {
    console.log(`  ${code}: ${name}`);
  });
  
  console.log('Expected: 38+ languages');
  console.log('✓ Test complete\n');
  
  return languages;
}

// Test 17: Run All Tests
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  ChatBridge Translation Module - Test Suite       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  
  try {
    // Basic tests
    await testBasicTranslation();
    await testConversationTranslation();
    await testUserOnlyMode();
    
    // Domain detection tests
    await testTechnicalDomain();
    testDomainDetection();
    
    // Code preservation tests
    await testCodePreservation();
    await testInlineCodePreservation();
    
    // Summarization test
    await testSummarizeAndTranslate();
    
    // Typography tests
    await testFrenchTypography();
    await testSpanishPunctuation();
    await testJapanesePunctuation();
    
    // Markdown test
    await testMarkdownPreservation();
    
    // Error handling tests
    await testInvalidLanguage();
    await testInvalidMode();
    
    // Utility function tests
    testCleanText();
    testGetSupportedLanguages();
    
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ✓ All tests completed successfully!              ║');
    console.log('╚════════════════════════════════════════════════════╝');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
  }
}

// Instructions
console.log(`
ChatBridge Translation Module - Test Suite
===========================================

Available test functions:
  - runAllTests()                    Run complete test suite
  - testBasicTranslation()           Basic string translation
  - testConversationTranslation()    Translate conversation array
  - testUserOnlyMode()               Test mode='user' filtering
  - testTechnicalDomain()            Technical domain detection
  - testCodePreservation()           Code block preservation
  - testInlineCodePreservation()     Inline code preservation
  - testSummarizeAndTranslate()      Summarize before translate
  - testFrenchTypography()           French punctuation spacing
  - testSpanishPunctuation()         Spanish inverted marks
  - testJapanesePunctuation()        Japanese full-width punctuation
  - testMarkdownPreservation()       Markdown formatting
  - testInvalidLanguage()            Error handling
  - testCleanText()                  Text cleaning
  - testDomainDetection()            Domain detection accuracy
  - testGetSupportedLanguages()      List languages

Usage:
  Copy this file content to browser console, then run:
    await runAllTests()
  
  Or run individual tests:
    await testBasicTranslation()
    await testCodePreservation()
    etc.
`);
