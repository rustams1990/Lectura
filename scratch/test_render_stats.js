import fs from 'fs';
import React from 'react';

// Mock React Hooks Dispatcher so we can run StatisticsPage component as a pure function!
const mockDispatcher = {
  useState: (initial) => {
    const val = typeof initial === 'function' ? initial() : initial;
    return [val, (newVal) => {}];
  },
  useMemo: (factory, deps) => factory(),
  useEffect: (effect, deps) => {},
  useRef: (initial) => ({ current: initial }),
  useCallback: (callback, deps) => callback,
  useContext: (context) => context._currentValue,
};

// Inject mock dispatcher into React's internal owner
const ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CAN_AND_WILL_BROKEN || React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
if (ReactSharedInternals) {
  ReactSharedInternals.H = mockDispatcher;
} else {
  console.warn("Could not find React shared internals to mock dispatcher.");
}

// Now dynamic import StatisticsPage and types
async function run() {
  try {
    // Read the database
    const dbData = fs.readFileSync('local_server_db.json', 'utf8');
    const parsed = JSON.parse(dbData);
    
    // We import the compiled StatisticsPage from our local tsx
    // Since we run this via tsx (which compiles TS files on the fly), we can import it directly!
    const StatisticsPageModule = await import('../src/components/StatisticsPage.tsx');
    const StatisticsPage = StatisticsPageModule.default;
    
    console.log("Mock environment set up. Invoking StatisticsPage rendering...");
    
    const props = {
      lingqs: parsed.lingqs || {},
      lessons: parsed.lessons || [],
      listeningSeconds: parsed.listeningSeconds || 0,
      onUpdateStatus: () => {},
      onDeleteLingQ: () => {},
      onDeleteMultipleLingQs: () => {},
      onSaveLingQ: () => {},
      onSaveMultipleLingQs: () => {},
      onRenameLingQ: () => {},
      wordLinks: parsed.wordLinks || {},
      onSaveWordLink: () => {},
      onDeleteWordLink: () => {},
      onOpenLesson: () => {},
    };
    
    // Execute the component as a regular function
    const vdom = StatisticsPage(props);
    console.log("Render completed successfully! Root type:", vdom.type);
    
    // Let's traverse the vdom tree to see if there are any crash points inside lazy-evaluated functions/children
    console.log("Traversing VDOM recursively to trigger all evaluations...");
    
    function traverse(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(traverse);
        return;
      }
      if (typeof node === 'object') {
        if (node.props) {
          if (node.props.children) {
            traverse(node.props.children);
          }
          // If child is a function (render prop)
          for (const key of Object.keys(node.props)) {
            const val = node.props[key];
            if (typeof val === 'function' && key !== 'onClick' && key !== 'onChange' && key !== 'onBlur') {
              try {
                // Try to invoke it if it's a simple render prop with no args
                const res = val();
                traverse(res);
              } catch (e) {}
            }
          }
        }
      }
    }
    
    traverse(vdom);
    console.log("VDOM traversed completely. NO ERRORS DETECTED!");
  } catch (err) {
    console.error("RENDER CRASH DETECTED:", err);
  }
}

run();
