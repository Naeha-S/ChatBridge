// ChatBridge Test Suite - Quick verification of new features
// Open browser console and paste this to test implementations

(async function testChatBridgeFeatures() {
  console.log('🧪 ChatBridge Feature Test Suite\n');
  const results = [];

  // Test 1: MCP Bridge Initialization
  console.log('1️⃣ Testing MCP Bridge...');
  try {
    if (typeof window.MCPBridge !== 'undefined') {
      const stats = window.MCPBridge.getStats();
      const passed = stats.registeredResources.length === 3;
      results.push({ 
        test: 'MCP Bridge', 
        passed, 
        details: `${stats.registeredResources.length} resources: ${stats.registeredResources.join(', ')}`
      });
      console.log(passed ? '✅ PASS' : '❌ FAIL', stats);
    } else {
      results.push({ test: 'MCP Bridge', passed: false, details: 'MCPBridge not found' });
      console.log('❌ FAIL - MCPBridge not loaded');
    }
  } catch (e) {
    results.push({ test: 'MCP Bridge', passed: false, details: e.message });
    console.log('❌ ERROR', e);
  }

  // Test 2: Security Module
  console.log('\n2️⃣ Testing Security Module...');
  try {
    if (typeof window.ChatBridgeSecurity !== 'undefined') {
      // Test encryption/decryption
      const testKey = 'test-api-key-12345';
      const encrypted = await window.ChatBridgeSecurity.encrypt(testKey);
      const decrypted = await window.ChatBridgeSecurity.decrypt(encrypted);
      const encryptPassed = decrypted === testKey && encrypted !== testKey;
      
      // Test sanitization
      const testText = 'Contact me at john.doe@example.com or call 555-123-4567';
      const sanitized = window.ChatBridgeSecurity.sanitize(testText);
      const sanitizePassed = sanitized.includes('***') && !sanitized.includes('john.doe@example.com');
      
      results.push({ 
        test: 'Security Encryption', 
        passed: encryptPassed,
        details: `Original: ${testKey.substring(0, 10)}..., Encrypted: ${encrypted.substring(0, 20)}...`
      });
      results.push({ 
        test: 'Security Sanitization', 
        passed: sanitizePassed,
        details: `Redacted ${testText.length - sanitized.length} characters`
      });
      
      console.log(encryptPassed ? '✅ PASS' : '❌ FAIL', 'Encryption');
      console.log(sanitizePassed ? '✅ PASS' : '❌ FAIL', 'Sanitization');
      console.log('   Sanitized output:', sanitized);
    } else {
      results.push({ test: 'Security Module', passed: false, details: 'ChatBridgeSecurity not found' });
      console.log('❌ FAIL - Security module not loaded');
    }
  } catch (e) {
    results.push({ test: 'Security Module', passed: false, details: e.message });
    console.log('❌ ERROR', e);
  }

  // Test 3: RAG Engine
  console.log('\n3️⃣ Testing RAG Engine...');
  try {
    if (typeof window.RAGEngine !== 'undefined') {
      const hasIndex = typeof window.RAGEngine.indexConversation === 'function';
      const hasThemes = typeof window.RAGEngine.getThemeEvolution === 'function';
      const hasRetrieve = typeof window.RAGEngine.retrieve === 'function';
      
      results.push({ 
        test: 'RAG Engine API', 
        passed: hasIndex && hasThemes && hasRetrieve,
        details: `indexConversation: ${hasIndex}, getThemeEvolution: ${hasThemes}, retrieve: ${hasRetrieve}`
      });
      
      console.log(hasIndex && hasThemes && hasRetrieve ? '✅ PASS' : '❌ FAIL');
      console.log('   API methods:', { indexConversation: hasIndex, getThemeEvolution: hasThemes, retrieve: hasRetrieve });
    } else {
      results.push({ test: 'RAG Engine', passed: false, details: 'RAGEngine not found' });
      console.log('❌ FAIL - RAG Engine not loaded');
    }
  } catch (e) {
    results.push({ test: 'RAG Engine', passed: false, details: e.message });
    console.log('❌ ERROR', e);
  }

  // Test 4: Rate Limiter (if in background context)
  console.log('\n4️⃣ Testing Rate Limiter...');
  try {
    if (typeof window.ChatBridgeSecurity !== 'undefined' && window.ChatBridgeSecurity.RateLimiter) {
      const limiter = new window.ChatBridgeSecurity.RateLimiter({ maxPerMinute: 3, maxPerHour: 10 });
      
      // Test allowance
      const check1 = limiter.isAllowed();
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();
      const check2 = limiter.isAllowed(); // Should be blocked
      
      const passed = check1.allowed === true && check2.allowed === false;
      results.push({ 
        test: 'Rate Limiter', 
        passed,
        details: `First check: ${check1.allowed}, After 3 requests: ${check2.allowed}`
      });
      
      console.log(passed ? '✅ PASS' : '❌ FAIL');
      console.log('   Stats:', limiter.getStats());
    } else {
      results.push({ test: 'Rate Limiter', passed: false, details: 'RateLimiter not available' });
      console.log('⏭️  SKIP - RateLimiter only available in background context');
    }
  } catch (e) {
    results.push({ test: 'Rate Limiter', passed: false, details: e.message });
    console.log('❌ ERROR', e);
  }

  // Test 5: UI Components
  console.log('\n5️⃣ Testing UI Components...');
  try {
    const cbHost = document.getElementById('cb-host');
    const hasSidebar = !!cbHost;
    
    if (hasSidebar) {
      const shadow = cbHost.shadowRoot;
      const hasInsightsTab = !!shadow.querySelector('#cb-tab-insights');
      const hasAgentsTab = !!shadow.querySelector('#cb-tab-agents');
      
      results.push({ 
        test: 'UI Injection', 
        passed: hasInsightsTab && hasAgentsTab,
        details: `Sidebar: ${hasSidebar}, Insights tab: ${hasInsightsTab}, Agents tab: ${hasAgentsTab}`
      });
      
      console.log(hasInsightsTab && hasAgentsTab ? '✅ PASS' : '❌ FAIL');
      console.log('   Shadow DOM elements found:', { 
        sidebar: hasSidebar, 
        insightsTab: hasInsightsTab, 
        agentsTab: hasAgentsTab 
      });
    } else {
      results.push({ test: 'UI Injection', passed: false, details: 'ChatBridge sidebar not found' });
      console.log('⏭️  SKIP - Open sidebar to test UI components');
    }
  } catch (e) {
    results.push({ test: 'UI Components', passed: false, details: e.message });
    console.log('❌ ERROR', e);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.test}: ${r.details}`);
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${results.length} tests | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('='.repeat(50));
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! ChatBridge is ready to use.');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Check implementation.`);
  }

  return { passed, failed, results };
})();
