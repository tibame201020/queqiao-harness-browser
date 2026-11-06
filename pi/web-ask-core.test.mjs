import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebAskTool,createChatGptTool} from './web-ask-core.mjs';
import {createChatGptTool as compatibilityAlias} from './chatgpt-core.mjs';

test('Shared Web Ask Core is independent of ChatGPT name, with backward compatibility for old factory',()=>{
 assert.equal(typeof createWebAskTool,'function');
 assert.equal(typeof createChatGptTool,'function');
 assert.equal(typeof compatibilityAlias,'function');
 assert.throws(()=>createWebAskTool({provider:'unknown',profile:'test',stateDir:'/tmp/test',transport:{}}),/UNKNOWN_WEB_PROVIDER/);
});
