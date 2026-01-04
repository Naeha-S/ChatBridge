# Quick Fix for ChatBridge Errors

## Issue
There's duplicate code in the translation handler causing syntax errors.

## Fix
In `content_script.js`, around line 10629-10638, remove these duplicate lines:

```javascript
        transResult.style.display = 'block';
        btnInsertTrans.style.display = 'inline-block';
        transProg.style.display = 'none';
        toast('Translation completed');
      } catch (err) {
        toast('Translation failed: ' + (err && err.message ? err.message : err));
        console.error('[ChatBridge] Translation error:', err);
        transProg.style.display = 'none';
      } finally { btnGoTrans.disabled = false; }
    });
```

These lines are duplicated from the old handler and should be removed. The correct handler ends at line 10627 with:

```javascript
      } finally {
        btnGoTrans.disabled = false;
      }
    });
```

Then the next handler should start immediately with:

```javascript
    btnInsertTrans.addEventListener('click', async () => {
```

## Steps to Fix
1. Open `content_script.js` in your editor
2. Go to line 10629
3. Delete lines 10629-10638 (the duplicate code block)
4. Save the file
5. Reload the extension in Chrome

## Summary of All Fixes
1. ✅ **Preview too long** - Fixed to show only 5-6 words
2. ✅ **Translation module not loaded** - Added better error message with debug info
3. ✅ **Rewrite error** - Fixed by removing undefined `getSelectedMessages` call
4. ⚠️ **Syntax error** - Remove duplicate code as shown above

After fixing, all features should work correctly!
