const Parser = window.TreeSitter;
let tree;

(async () => {
    const CAPTURE_REGEX = /@\s*([\w\._-]+)/g;
    const COLORS_BY_INDEX = [
        'blue',
        'chocolate',
        'darkblue',
        'darkcyan',
        'darkgreen',
        'darkred',
        'darkslategray',
        'dimgray',
        'green',
        'indigo',
        'navy',
        'red',
        'sienna',
    ];
    function colorForCaptureName(capture) {
        const id = query.captureNames.indexOf(capture);
        return COLORS_BY_INDEX[id % COLORS_BY_INDEX.length];
    }

    const codeInput = document.getElementById('code-input');
    // const updateTimeSpan = document.getElementById('update-time');

    loadState();

    const codeEditor = CodeMirror.fromTextArea(codeInput, {
        lineNumbers: true,
        showCursorWhenSelecting: true
    });

    const saveStateOnChange = debounce(saveState, 2000);
    const runTreeQueryOnChange = debounce(runTreeQuery, 50);

    let parseCount = 0;
    let query;

    codeEditor.on('changes', handleCodeChange);
    codeEditor.on('viewportChange', runTreeQueryOnChange);

    await Parser.init();
    
    const parser = new Parser;
    const Hoon = await Parser.Language.load("tree-sitter-hoon.wasm");
    parser.setLanguage(Hoon);
    query = parser.getLanguage().query(`
        (number) @number

        (string) @string
        
        [
            (coreTerminator)
            (seriesTerminator)
        ] @punctuation.delimiter
        
        (rune) @keyword
        
        (term) @constant
        
        (aura) @constant.builtin
        
        (Gap) @comment
        
        (boolean) @constant.builtin
        
        (date) @constant.builtin
        (mold) @constant.builtin
        (specialIndex) @constant.builtin
        (lark) @operator
        (fullContext) @constant.builtin
    `);

    async function handleCodeChange(editor, changes) {
        const newText = codeEditor.getValue() + '\n';
        const edits = tree && changes && changes.map(treeEditForEditorChange);

        const start = performance.now();
        if (edits) {
            for (const edit of edits) {
            tree.edit(edit);
            }
        }
        const newTree = parser.parse(newText, tree);
        const duration = (performance.now() - start).toFixed(1);

        // updateTimeSpan.innerText = `${duration} ms`;
        if (tree) tree.delete();
        tree = newTree;
        parseCount++;
        runTreeQueryOnChange();
        saveStateOnChange();
    }
    handleCodeChange(codeEditor, "")

    function treeEditForEditorChange(change) {
        const oldLineCount = change.removed.length;
        const newLineCount = change.text.length;
        const lastLineLength = change.text[newLineCount - 1].length;

        const startPosition = {row: change.from.line, column: change.from.ch};
        const oldEndPosition = {row: change.to.line, column: change.to.ch};
        const newEndPosition = {
            row: startPosition.row + newLineCount - 1,
            column: newLineCount === 1
            ? startPosition.column + lastLineLength
            : lastLineLength
        };

        const startIndex = codeEditor.indexFromPos(change.from);
        let newEndIndex = startIndex + newLineCount - 1;
        let oldEndIndex = startIndex + oldLineCount - 1;
        for (let i = 0; i < newLineCount; i++) newEndIndex += change.text[i].length;
        for (let i = 0; i < oldLineCount; i++) oldEndIndex += change.removed[i].length;

        return {
            startIndex, oldEndIndex, newEndIndex,
            startPosition, oldEndPosition, newEndPosition
        };
    }

    function runTreeQuery(_, startRow, endRow) {
        if (endRow == null) {
            const viewport = codeEditor.getViewport();
            startRow = viewport.from;
            endRow = viewport.to;
        }

        codeEditor.operation(() => {
            const marks = codeEditor.getAllMarks();
            marks.forEach(m => m.clear());

            if (tree && query) {
            const captures = query.captures(
                tree.rootNode,
                {row: startRow, column: 0},
                {row: endRow, column: 0},
            );
            let lastNodeId;
            for (const {name, node} of captures) {
                if (node.id === lastNodeId) continue;
                lastNodeId = node.id;
                const {startPosition, endPosition} = node;
                codeEditor.markText(
                {line: startPosition.row, ch: startPosition.column},
                {line: endPosition.row, ch: endPosition.column},
                {
                    inclusiveLeft: true,
                    inclusiveRight: true,
                    css: `color: ${colorForCaptureName(name)}`
                }
                );
            }
            }
        });
    }
    

    function loadState() {
        const sourceCode = localStorage.getItem("sourceCode");
        if (sourceCode) {
            codeInput.value = sourceCode;
        }else{
            codeInput.value = `

:: Example program from hoon school guide https://developers.urbit.org/guides/core/hoon-school/K-doors#exercise-display-cards 
!:
|=  [msg=tape steps=@ud]
=<
=.  msg  (cass msg)
:-  (shift msg steps)
    (unshift msg steps)
::
|%
++  alpha  "abcdefghijklmnopqrstuvwxyz"
::  Shift a message to the right.
::
++  shift
    |=  [message=tape steps=@ud]
    ^-  tape
    (operate message (encoder steps))
::  Shift a message to the left.
::
++  unshift
    |=  [message=tape steps=@ud]
    ^-  tape
    (operate message (decoder steps))
::  Rotate forwards into encryption.
::
++  encoder
    |=  [steps=@ud]
    ^-  (map @t @t)
    =/  value-tape=tape  (rotation alpha steps)
    (space-adder alpha value-tape)
::  Rotate backwards out of encryption.
::
++  decoder
    |=  [steps=@ud]
    ^-  (map @t @t)
    =/  value-tape=tape  (rotation alpha steps)
    (space-adder value-tape alpha)
::  Apply the map of decrypted->encrypted letters to the message.
::
++  operate
    |=  [message=tape shift-map=(map @t @t)]
    ^-  tape
    %+  turn  message
    |=  a=@t
    (~(got by shift-map) a)
::  Handle spaces in the message.
::
++  space-adder
    |=  [key-position=tape value-result=tape]
    ^-  (map @t @t)
    (~(put by (map-maker key-position value-result)) ' ' ' ')
::  Produce a map from each letter to its encrypted value.
::
++  map-maker
    |=  [key-position=tape value-result=tape]
    ^-  (map @t @t)
    =|  chart=(map @t @t)
    ?.  =((lent key-position) (lent value-result))
    ~|  %uneven-lengths  !!
    |-
    ?:  |(?=(~ key-position) ?=(~ value-result))
    chart
    $(chart (~(put by chart) i.key-position i.value-result), key-position t.key-position, value-result t.value-result)
::  Cycle an alphabet around, e.g. from
::  'ABCDEFGHIJKLMNOPQRSTUVWXYZ' to 'BCDEFGHIJKLMNOPQRSTUVWXYZA'
::
++  rotation
    |=  [my-alphabet=tape my-steps=@ud]
    =/  length=@ud  (lent my-alphabet)
    =+  (trim (mod my-steps length) my-alphabet)
    (weld q p)
--
            ` 
        }
    }
    
    function saveState() {
        localStorage.setItem("sourceCode", codeEditor.getValue());
    }

    function debounce(func, wait, immediate) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
            };
            var callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func.apply(context, args);
        };
    }

})();