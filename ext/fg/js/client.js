/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Client {
    constructor() {
        this.popup        = new Popup();
        this.lastMousePos = null;
        this.lastRange    = null;
        this.activateKey  = 16;
        this.activateBtn  = 2;
        this.enabled      = false;
        this.options      = {};
        this.results      = null;
        this.xhr          = null;
        this.fgRoot       = chrome.extension.getURL('fg');

        chrome.runtime.onMessage.addListener(this.onBgMessage.bind(this));
        window.addEventListener('message', this.onFrameMessage.bind(this));
        window.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('scroll', (e) => this.hidePopup());
        window.addEventListener('resize', (e) => this.hidePopup());

        getOptions((opts) => {
            this.setOptions(opts);
            getState((state) => this.setEnabled(state === 'enabled'));
        });
    }

    onKeyDown(e) {
        if (this.enabled && this.lastMousePos !== null && (e.keyCode === this.activateKey || e.charCode === this.activateKey)) {
            this.searchAt(this.lastMousePos);
        }
    }

    onMouseMove(e) {
        this.lastMousePos = {x: e.clientX, y: e.clientY};
        if (this.enabled && (e.shiftKey || e.which === this.activateBtn)) {
            this.searchAt(this.lastMousePos);
        }
    }

    onMouseDown(e) {
        this.lastMousePos = {x: e.clientX, y: e.clientY};
        if (this.enabled && (e.shiftKey || e.which === this.activateBtn)) {
            this.searchAt(this.lastMousePos);
        } else {
            this.hidePopup();
        }
    }

    onBgMessage({name, value}, sender, callback) {
        switch (name) {
            case 'state':
                this.setEnabled(value === 'enabled');
                break;
            case 'options':
                this.setOptions(value);
                break;
        }

        callback();
    }

    onFrameMessage(e) {
        const callback = (data) => {
            e.source.postMessage(data, e.origin);
        };

        const {action, data} = e.data, handlers = {
            addNote:      ({mode, index}) => this.addNote(mode, index, callback),
            displayKanji: this.displayKanji
        };

        if (handlers.hasOwnProperty(action)) {
            handlers[action].call(this, data);
        }
    }

    searchAt(point) {
        const range = Range.fromPoint(point);
        if (range === null || !range.containsPoint(point)) {
            this.hidePopup();
            return;
        }

        if (this.lastRange !== null && this.lastRange.compareOrigin(range) === 0) {
            return;
        }

        range.setLength(this.options.scanLength);
        findTerm(range.text(), ({results, length}) => {
            if (length === 0) {
                this.hidePopup();
            } else {
                range.setLength(length);
                renderText(
                    {defs: results, root: this.fgRoot, options: this.options},
                    'term-list.html',
                    (content) => {
                        this.results = results;
                        this.showPopup(range, content, results);
                    }
                );
            }
        });
    }

    addNote(mode, index, callback) {
        callback({action: 'disableAction', data: {mode: mode, index: index}});
        // this.callAnkiApi('addNote', {mode: mode, definition: this.results[index]});
    }

    displayKanji(kanji) {
        findKanji(kanji, (results) => {
            renderText(
                {defs: results, root: this.fgRoot, options: this.options},
                'kanji-list.html',
                (content) => {
                    this.results = results;
                    this.popup.setContent(content, results);
                }
            );
        });
    }

    showPopup(range, content) {
        this.popup.showNextTo(range.getRect(), content);

        if (this.options.selectMatchedText) {
            range.select();
        }

        this.lastRange = range;
    }

    hidePopup() {
        this.popup.hide();

        if (this.options.selectMatchedText && this.lastRange !== null) {
            this.lastRange.deselect();
        }

        this.lastRange = null;
        this.results   = null;
    }

    setEnabled(enabled) {
        if (!(this.enabled = enabled)) {
            this.hidePopup();
        }
    }

    setOptions(opts) {
        this.options = opts;
    }

    callAnkiApi(action, data, callback) {
        if (!this.options.enableAnkiConnect) {
            callback(null);
            return;
        }

        if (this.xhr !== null) {
            this.xhr.abort();
        }

        this.xhr = new XMLHttpRequest();
        this.xhr.addEventListener('loadend', () => {
            const resp = this.xhr.responseText;
            callback(resp ? JSON.parse(resp) : null);
            this.xhr = null;
        });

        this.xhr.open('POST', 'http://127.0.0.1:8888');
        this.xhr.withCredentials = true;
        this.xhr.setRequestHeader('Content-Type', 'text/json');
        this.xhr.send(JSON.stringify({action: action, data: data}));
    }
}

window.yomiClient = new Client();
