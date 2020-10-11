/*
 * uGet Integration is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, Vivaldi, Opera and Mozilla Firefox in Linux and Windows.
 *
 * Copyright (C) 2016  Gobinath
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

/*  The modifications work with Uget + Aria2. Uget+Curl untested. */
const EXTENSION_VERSION = "2.1.3";
const REQUIRED_INTEGRATOR_VERSION = "1.0.0";
const MAX_FILE_SIZE = Number.MAX_SAFE_INTEGER;
var interruptDownloadOne = true;
var ugetIntegratorNotFound = true;
var hostName;
var ugetIntegratorVersion;
var ugetVersion = '';
var chromeVersion;
var firefoxVersion;
var minFileSizeToInterrupt = 300 * 1024; // 300 kb
var current_browser;
var filter = [];
var myFile = '';
var urlsToSkip = [];
var urlsToInterrupt = [];
var mimeToSkip = [];
var mimeToInterrupt = [];
var mediasInTab = {}; //
// var cookies = '';
var detailsUget;
var currRequest = 0;
var message = {
    URL: '',
    Cookies: '',
    UserAgent: navigator.userAgent,
    FileName: '',
    FileSize: '',
    Referer: '',
    PostData: '',
    Batch: false,
    Version: EXTENSION_VERSION
};
var requestList = [{
    cookies: '',
    postData: '',
    id: ''
}, {
    cookies: '',
    postData: '',
    id: ''
}, {
    cookies: '',
    postData: '',
    id: ''
}
];
function start() {
    initialize();
    readStorage();
    setDownloadHooks();
    enableVideoGrabber();
}
/**
 * Initialize the variables.
 */
function initialize() {
    // Get the running browser
    try {
        chromeVersion = /Chrome\/([0-9]+)/.exec(navigator.userAgent)[1];
    } catch (ex) {
        chromeVersion = 33;
    }
    try {
        current_browser = browser;
        hostName = 'com.ugetdm.firefox';
        current_browser.runtime.getBrowserInfo().then(
            function (info) {
                if (info.name === 'Firefox') {
                    // Convert version string to int
                    firefoxVersion = parseInt(info.version.replace(/[ab]\d+/, '').split('.')[0]);
                }
            });
    } catch (ex) {
        firefoxVersion = 0;
        current_browser = chrome;
        hostName = 'com.ugetdm.chrome';
    }
    // Set keyboard shortcut listener
    current_browser.commands.onCommand.addListener(function (command) {
        if ("toggle-interruption" === command) {
            // Toggle
            setInterruptDownload(!interruptDownloadOne, true);
        }
    });
    chromeVersion = parseInt(chromeVersion);
    sendMessageToHost(message);
    createContextMenus();
}
/**
 * Read storage for extension specific preferences.
 * If no preferences found, initialize with default values.
 */
function readStorage() {
    current_browser.storage.sync.get(function (items) {
        // Read the storage for excluded keywords
        if (items["uget-urls-exclude"]) {
            urlsToSkip = items["uget-urls-exclude"].toLowerCase().split(/[\s,]+/).filter(item => item);
        } else {
            current_browser.storage.sync.set({
                "uget-urls-exclude": ''
            });
        }
        // Read the storage for included keywords
        if (items["uget-urls-include"]) {
            urlsToInterrupt = items["uget-urls-include"].toLowerCase().split(/[\s,]+/).filter(item => item);
        } else {
            current_browser.storage.sync.set({
                "uget-urls-include": ''
            });
        }
        if (items["uget-mime-exclude"]) {
            mimeToSkip = items["uget-mime-exclude"].toLowerCase().split(/[\s,]+/).filter(item => item);
        } else {
            current_browser.storage.sync.set({
                "uget-mime-exclude": ''
            });
        }
        // Read the storage for included keywords
        if (items["uget-mime-include"]) {
            mimeToInterrupt = items["uget-mime-include"].toLowerCase().split(/[\s,]+/).filter(item => item);
        } else {
            current_browser.storage.sync.set({
                "uget-mime-include": ''
            });
        }
        // Read the storage for the minimum file-size to interrupt
        if (items["uget-min-file-size"]) {
            minFileSizeToInterrupt = parseInt(items["uget-min-file-size"]);
        } else {
            current_browser.storage.sync.set({
                "uget-min-file-size": minFileSizeToInterrupt
            });
        }
        // Read the storage for enabled flag
        if (!items["uget-interrupt"]) {
            // Keep the value string
            current_browser.storage.sync.set({
                "uget-interrupt": 'true'
            });
        } else {
            var interrupt = (items["uget-interrupt"] == "true");
            setInterruptDownload(interrupt);
        }
    });
}
/**
 * Create required context menus and set listeners.
 */
function createContextMenus() {
    current_browser.contextMenus.create({
        title: 'Download with uGet',
        id: "download_with_uget",
        contexts: ['link']
    });
    current_browser.contextMenus.create({
        title: 'Download all links with uGet',
        id: "download_all_links_with_uget",
        contexts: ['page']
    });
    current_browser.contextMenus.create({
        title: 'Download media with uGet',
        id: "download_media_with_uget",
        enabled: false,
        contexts: ['page']
    });
    current_browser.contextMenus.onClicked.addListener(function (info, tab) {
        "use strict";
        let page_url = info.pageUrl; //url of the current page, not the link.
        let link_url = info['linkUrl'];
        if (info.menuItemId === "download_with_uget") {
            Promise.all([
                fetch(link_url).then(response => response.headers)
            ]).then(([headResponse]) => {
                //message.FileSize = parseInt(headResponse.get('Content-Length'));
                message.FileName = stripFileName(headResponse.get('content-disposition'));
                current_browser.cookies.getAll({
                    'url': extractRootURL(link_url)
                }, parseCookies);
            });
            message.URL = link_url;
            message.Referer = page_url;
        } else if (info.menuItemId === "download_all_links_with_uget") {
            current_browser.tabs.executeScript(null, {
                file: 'extract.js'
            }, function (results) {
                // Do nothing
                if (results[0].success) {
                    message.URL = results[0].urls;
                    message.Referer = page_url;
                    message.Batch = true;
                    current_browser.cookies.getAll({
                        'url': extractRootURL(page_url)
                    }, parseCookies);
                }
            });
        } else if (info.menuItemId === "download_media_with_uget") {
            if (page_url.includes('/www.youtube.com/watch?v=')) {
                // Youtube
                message.URL = page_url;
                message.Referer = page_url;
                current_browser.cookies.getAll({
                    'url': extractRootURL(page_url)
                }, parseCookies);
            } else {
                // Other videos
                var media_set = mediasInTab[tab['id']];
                if (media_set) {
                    var urls = Array.from(media_set);
                    var no_or_urls = urls.length;
                    if (no_or_urls == 1) {
                        message.URL = urls[0];
                        message.Referer = page_url;
                        current_browser.cookies.getAll({
                            'url': extractRootURL(page_url)
                        }, parseCookies);
                    } else if (no_or_urls > 1) {
                        message.URL = urls.join('\n');
                        message.Referer = page_url;
                        message.Batch = true;
                        current_browser.cookies.getAll({
                            'url': extractRootURL(page_url)
                        }, parseCookies);
                    }
                }
            }
        }
    });
}
/**
 * Set hooks to interrupt downloads.
 */
function setDownloadHooks() {
    // Interrupt downloads on creation
    current_browser.downloads.onCreated.addListener(function (downloadItem) {
        //console.log(downloadItem.id);
        if (ugetIntegratorNotFound || !interruptDownloadOne) { // uget-integrator not installed
            return;
        }
        if ("in_progress" !== downloadItem['state'].toString().toLowerCase()) {
            return;
        }
        let link_url = downloadItem['url'] || downloadItem['finalUrl'];
        Promise.all([
            fetch(link_url).then(response => response.headers)
        ]).then(([headResponse]) => {
            message.FileSize = parseInt(headResponse.get('Content-Length'));
            message.FileName = stripFileName(headResponse.get('content-disposition'));
        });
        let UfileExtension = stripExtension(link_url);
        let Umime = downloadItem['mime'];
        if (!link_url.match(/^(https?\:|ftp\:)/g)) {
            return;
        }
        // Do not interrupt blacklisted items
        if (isBlackListedURL(link_url) || isBlackListedContent(UfileExtension) || isBlackListedContent(Umime)) {
            return;
            // Always interrupt whitelisted items
        }
        if (isWhiteListedURL(link_url) || isWhiteListedContent(UfileExtension) || isWhiteListedContent(Umime)) {
            message.FileSize = MAX_FILE_SIZE;
        }
        if (message.FileSize < minFileSizeToInterrupt) {
            return;
        }
        // Cancel the download
        current_browser.downloads.cancel(downloadItem.id);
        // Erase the download from list
        current_browser.downloads.erase({
            id: downloadItem.id
        });
        message.URL = link_url;
        message.Referer = downloadItem['referrer'];
        current_browser.cookies.getAll({
            'url': extractRootURL(link_url)
        }, parseCookies);
    })
    current_browser.webRequest.onBeforeRequest.addListener(function (details) {
        ///???????
        /*         console.log(details.method);
                console.log(details.requestBody);
                console.log(details.requestBody.formData);
                 if (details.method === 'POST') {
                    message.PostData = postParams(details.requestBody.formData);
                }   */
        return {
            requestHeaders: details.requestHeaders
        };
    }, {
        urls: [
            '<all_urls>'
        ],
        types: [
            'main_frame',
            'sub_frame'
        ]
    }, [
        'blocking',
        'requestBody'
    ]);
    current_browser.webRequest.onBeforeSendHeaders.addListener(function (details) {
        ///?????????????????????
        // currRequest++;
        // if (currRequest > 2)
        //     currRequest = 2;
        // requestList[currRequest].id = details.requestId;
        // message.UserAgent = navigator.userAgent;
        // for (let i = 0; i < details.requestHeaders.length; ++i) {
        //     if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
        //         requestList[currRequest].referrer = details.requestHeaders[i].value;
        //     } else if (details.requestHeaders[i].name.toLowerCase() === 'cookie') {
        //         requestList[currRequest].cookies = details.requestHeaders[i].value;
        //     }
        // }
        return {
            requestHeaders: details.requestHeaders
        };
    }, {
        urls: [
            '<all_urls>'
        ],
        types: [
            'main_frame',
            'sub_frame',
            'xmlhttprequest'
        ]
    }, [
        'blocking',
        'requestHeaders'
    ]);
    current_browser.webRequest.onHeadersReceived.addListener(function (details) {
        if (ugetIntegratorNotFound) { // uget-integrator not installed
            return {
                responseHeaders: details.responseHeaders
            };
        }
        if (!details.statusLine.includes("200")) { // HTTP response is not OK
            return {
                responseHeaders: details.responseHeaders
            };
        }
        if (isBlackListedURL(details.url)) {
            return {
                responseHeaders: details.responseHeaders
            };
        }
        //debugger;//
        let interruptDownloadTwo = false;
        //console.log(details.requestHeaders);
        let ContentType = details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-type').value;
        //message.FileName = '';
        //debugger;

        //let ContentDisposition = details.responseHeaders.find(({ name }) => name === 'content-disposition').value;
        // console.log(details.responseHeaders.lastIndexOf(({ name }) => name.toLowerCase() === 'content-tye'));
        // console.log(details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-type'));
        //console.log(details);
        //console.log(ContentType.includes('text/html'));
        //console.log(ContentDisposition.value);        
        if (!ContentType.includes('text/html')) {
            try {
                message.FileName = stripFileName(details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-disposition').value);
            } catch (error) {
                message.FileName = '';
            }
            message.FileSize = parseInt(details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-length').value);
            message.URL = details.url;
            message.Referer = details.originUrl;
            let UfileExtension = stripExtension(details.url);
            // Do not interrupt blacklisted items
            if (isBlackListedURL(details.url) || isBlackListedContent(UfileExtension) || isBlackListedContent(ContentType)) {
                interruptDownloadTwo = false;
                return {
                    responseHeaders: details.responseHeaders
                };
                // Always interrupt whitelisted items
            }
            if (isWhiteListedURL(details.url) || isWhiteListedContent(UfileExtension) || isWhiteListedContent(ContentType)) {
                interruptDownloadTwo = true;
                message.FileSize = MAX_FILE_SIZE;
            }
            if (message.FileSize < minFileSizeToInterrupt) {
                interruptDownloadTwo = false;
                return {
                    responseHeaders: details.responseHeaders
                };
            }
            ///TODO: Remove the loop./
            // for (let i = 0; i < details.responseHeaders.length; ++i) {
            //     if (details.responseHeaders[i].name.toLowerCase() == 'content-length') {
            //         message.FileSize = parseInt(details.responseHeaders[i].value);
            //         if (message.FileSize < minFileSizeToInterrupt && !isWhiteListedURL(message.URL)) {
            //             interruptDownloadTwo = false;
            //             return {
            //                 responseHeaders: details.responseHeaders
            //             };
            //         }
            //     } else if (details.responseHeaders[i].name.toLowerCase() == 'content-type') {
            //         ContentType = details.responseHeaders[i].value;
            //         if (isBlackListedContent(UfileExtension) || isBlackListedContent(ContentType)) {
            //             interruptDownloadTwo = false;
            //             return {
            //                 responseHeaders: details.responseHeaders
            //             };
            //         } else if (isWhiteListedContent(UfileExtension) || isWhiteListedContent(ContentType)) {
            //             interruptDownloadTwo = true;
            //             break;
            //         } else {
            //             return {
            //                 responseHeaders: details.responseHeaders
            //             };
            //         }
            //     } else if (details.responseHeaders[i].name.toLowerCase() == 'content-disposition') {
            //         ContentDisposition = details.responseHeaders[i].value;
            //         if (ContentDisposition.lastIndexOf('filename') != -1) {
            //             message.FileName = stripFileName(ContentDisposition);
            //             interruptDownloadTwo = true;
            //         }
            //     }
            // }
            //}
            if (interruptDownloadTwo && interruptDownloadOne) {
                for (let i = 0; i < filter.length; i++) {
                    if (filter[i] != "" && ContentType.lastIndexOf(filter[i]) != -1) {
                        return {
                            responseHeaders: details.responseHeaders
                        };
                    }
                }
                ///???????????????????????
                // for (let i = 0; i < 3; i++) {
                //     if (details.requestId == requestList[i].id && requestList[i].id != "") {
                //         message.Referer = requestList[i].referrer;
                //         message.Cookies = requestList[i].cookies;
                //         break;
                //     }
                // }
                if (details.method != "POST") {
                    message.PostData = '';
                }
                current_browser.cookies.getAll({
                    'url': extractRootURL(message.URL)
                }, parseCookies);
                //let scheme = /^https/.test(details.url) ? 'https' : 'http'; //???????
                if (chromeVersion >= 35 || firefoxVersion >= 51) {
                    return {
                        redirectUrl: "javascript:"
                    };
                } else if (details.frameId === 0) {
                    current_browser.tabs.update(details.tabId, {
                        url: "javascript:"
                    });
                    let responseHeaders = details.responseHeaders.filter(function (header) {
                        let name = header.name.toLowerCase();
                        return name !== 'content-type' &&
                            name !== 'x-content-type-options' &&
                            name !== 'content-disposition';
                    }).concat([{
                        name: 'Content-Type',
                        value: 'text/plain'
                    }, {
                        name: 'X-Content-Type-Options',
                        value: 'nosniff'
                    }
                    ]);
                    return {
                        responseHeaders: responseHeaders
                    };
                }
                return {
                    cancel: true
                };
            } else {
                clearMessage();
            }
        }
        return {
            responseHeaders: details.responseHeaders
        };
    }, {
        urls: [
            '<all_urls>'
        ],
        types: [
            'main_frame',
            'sub_frame'
        ]
    }, [
        'responseHeaders',
        'blocking'
    ]);
}
/**
 * Check the TAB URL and enable download_media_with_uget if the page is Youtube
 * @param {*int} tabId
 */
function checkForYoutube(tabId, disableIfNot) {
    current_browser.tabs.get(tabId, function (tab) {
        isYoutube = tab['url'] && tab['url'].includes('/www.youtube.com/watch?v=')
        if (isYoutube) {
            current_browser.contextMenus.update("download_media_with_uget", {
                enabled: true
            });
        } else if (disableIfNot) {
            current_browser.contextMenus.update("download_media_with_uget", {
                enabled: false
            });
        }
    });
}
/**
 * Grab videos and add them to mediasInTab.
 */
function enableVideoGrabber() {
    current_browser.tabs.onActivated.addListener(function (activeInfo) {
        if (mediasInTab[activeInfo['tabId']] != undefined) {
            // Media already detected
            current_browser.contextMenus.update("download_media_with_uget", {
                enabled: true
            });
        } else {
            // Check for Youtube
            checkForYoutube(activeInfo['tabId'], true);
        }
    });
    current_browser.tabs.onRemoved.addListener(function (tabId, removeInfo) {
        if (mediasInTab[tabId]) {
            delete mediasInTab[tabId];
        }
    });
    current_browser.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
        if (changeInfo['status'] === 'loading') {
            // Loading a new page
            delete mediasInTab[tabId];
        }
        // Check for Youtube
        checkForYoutube(tabId, false);
    });
    current_browser.webRequest.onResponseStarted.addListener(function (details) {
        content_url = details['url'];
        type = details['type'];
        if (type === 'media' || content_url.includes('mp4')) {
            tabId = details['tabId'];
            mediaSet = mediasInTab[tabId];
            if (mediaSet == undefined) {
                mediaSet = new Set();
                mediasInTab[tabId] = mediaSet;
            }
            mediaSet.add(content_url);
            current_browser.contextMenus.update("download_media_with_uget", {
                enabled: true
            });
        }
    }, {
        urls: [
            '<all_urls>'
        ],
        types: [
            'media',
            'object'
        ]
    });
}
////////////////// Utility Functions //////////////////
/**
 * Send message to uget-integrator
 */
function sendMessageToHost(message) {
    current_browser.runtime.sendNativeMessage(hostName, message, function (response) {
        clearMessage();
        ugetIntegratorNotFound = (response == null);
        if (!ugetIntegratorNotFound && !ugetIntegratorVersion) {
            ugetIntegratorVersion = response.Version;
            ugetVersion = response.Uget;
        }
        changeIcon();
    });
}
/**
 * Return the internal state.
 */
function getState() {
    if (ugetIntegratorNotFound || !ugetIntegratorVersion) {
        return 2;
    } else if (!ugetIntegratorVersion.startsWith(REQUIRED_INTEGRATOR_VERSION)) {
        return 1;
    } else {
        return 0;
    }
}
/**
 * Clear the message.
 */
function clearMessage() {
    message.URL = '';
    message.Cookies = '';
    message.FileName = '';
    message.FileSize = '';
    message.Referer = '';
    message.UserAgent = navigator.userAgent;
    message.Batch = false;
}
/**
 * Extract the POST parameters from a form data.
 */
function postParams(source) {
    let array = [];
    for (var key in source) {
        array.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    }
    return array.join('&');
}
/**
 * Get the file size of given URL.
 * @param {string} url
 */

function stripFileName(content) {
    let FileName = '';
    if (content != null) {
        FileName = content.match(/filename\*?=["']?(?:UTF-\d['"]*)?((['"]).*?\2|[^\";\n]*)/)[1];
    }
    return FileName;
}
function stripExtension(url) {
    let FileName = url.split('/').pop();
    let FileNameExt = '';
    if (FileName != null) {
        FileNameExt = FileName.slice((FileName.lastIndexOf(".") - 1 >>> 0) + 2);
    }
    return FileNameExt.toString().toLowerCase();
}
/**
 * Extract the root of a URL.
 */
function extractRootURL(url) {
    let domain;
    if (url.indexOf("://") > -1) {
        domain = url.split('/', 3);
        domain = domain[0] + '//' + domain[2];
    } else {
        domain = url.split('/', 1)[0];
    }
    return domain.toString();
}
/**
 * Parse the cookies and send the message to the native host.
 */
function cookiesGetAll(url) {
    return current_browser.cookies.getAll({
        'url': extractRootURL(url)
    }, parseCookies);
}

function parseCookies(cookies_arr) {
    let cookies = '';
    for (let i in cookies_arr) {
        cookies += cookies_arr[i].domain + '\t';
        cookies += (cookies_arr[i].httpOnly ? "FALSE" : "TRUE") + '\t';
        cookies += cookies_arr[i].path + '\t';
        cookies += (cookies_arr[i].secure ? "TRUE" : "FALSE") + '\t';
        cookies += Math.round(cookies_arr[i].expirationDate) + '\t';
        cookies += cookies_arr[i].name + '\t';
        cookies += cookies_arr[i].value;
        cookies += '\n';
    }
    message.Cookies = cookies;
    sendMessageToHost(message);
}
/**
 * Update the exclude keywords.
 * Is called from the popup.js.
 */
function updateExcludeKeywords(exclude) {
    if (exclude === "") {
        urlsToSkip = [];
    } else {
        urlsToSkip = exclude.split(/[\s,]+/);
    }
    current_browser.storage.sync.set({
        "uget-urls-exclude": exclude
    });
}
/**
 * Update the include keywords.
 * Is called from the popup.js.
 */
function updateIncludeKeywords(include) {
    if (include === "") {
        urlsToInterrupt = [];
    } else {
        urlsToInterrupt = include.split(/[\s,]+/);
    }
    current_browser.storage.sync.set({
        "uget-urls-include": include
    });
}
/**
 * Update the exclude MIMEs.
 * Is called from the popup.js.
 */
function updateExcludeMIMEs(exclude) {
    if (exclude === "") {
        mimeToSkip = [];
    } else {
        mimeToSkip = exclude.split(/[\s,]+/);
    }
    current_browser.storage.sync.set({
        "uget-mime-exclude": exclude
    });
}
/**
 * Update the include MIMEs.
 * Is called from the popup.js.
 */
function updateIncludeMIMEs(include) {
    if (include === "") {
        mimeToInterrupt = [];
    } else {
        mimeToInterrupt = include.split(/[\s,]+/);
    }
    current_browser.storage.sync.set({
        "uget-mime-include": include
    });
}
/**
 * Update the minimum file size to interrupt.
 * Is called from the popup.js.
 */
function updateMinFileSize(size) {
    minFileSizeToInterrupt = size;
    current_browser.storage.sync.set({
        "uget-min-file-size": size
    });
}
/**
 * Check whether not to interrupt the given url.
 */
function isBlackListedURL(url) {
    if (!url) {
        return true;
    }
    let blackListed = false;
    // Test the URL
    let GoogleUrl = extractRootURL(url)
    if (GoogleUrl.includes("docs.google.com") || GoogleUrl.includes("googleusercontent.com/docs")) { // Cannot download from Google Docs
        blackListed = true;
    }
    for (var keyword of urlsToSkip) {
        if (url.includes(keyword)) {
            blackListed = true;
            break;
        }
    }
    return blackListed;
}
/**
 * Check whether not to interrupt the given url.
 */
function isBlackListedContent(blcontent) {
    let blackListed = false;
    blcontent = blcontent.toLowerCase();
    //mimeToSkip = mimeToSkip.filter(item => item);
    // Test the content type
    if (blcontent) {
        if (/\b(?:xml|text|rss|json|html|javascript|torrent|x-bittorrent|webp)\b/.test(blcontent)) {
            blackListed = true;
        } else {
            for (var keyword of mimeToSkip) {
                if (blcontent.includes(keyword.toString())) {
                    blackListed = true;
                    break;
                }
            }
        }
    }
    return blackListed;
}
/**
 * Check whether to interrupt the given url or not.
 */
function isWhiteListedURL(url) {
    if (!url) {
        return false;
    }
    let whiteListed = false;
    // Test the URL
    if (url.includes("video")) {
        whiteListed = true;
    }
    for (var keyword of urlsToInterrupt) {
        if (url.includes(keyword)) {
            whiteListed = true;
            break;
        }
    }
    return whiteListed;
}
/**
 * Check whether to interrupt the given content or not.
 */
function isWhiteListedContent(wlcontent) {
    let whiteListed = false;
    wlcontent = wlcontent.toLowerCase();
    //mimeToInterrupt = mimeToInterrupt.filter(item => item);
    if (wlcontent) {
        // if (/\b(?:application\/|video\/|audio\/)\b/.test(wlcontent)) {
        //     whiteListed = true;
        // } else {
        for (var keyword of mimeToInterrupt) {
            if (wlcontent.includes(keyword.toString())) {
                whiteListed = true;
                break;
            }
        }
        // }
    }
    return whiteListed;
}
/**
 * Enable/Disable the plugin and update the plugin icon based on the state.
 */
function setInterruptDownload(interrupt, writeToStorage) {
    interruptDownloadOne = interrupt;
    if (writeToStorage) {
        current_browser.storage.sync.set({
            "uget-interrupt": interrupt.toString()
        });
    }
    changeIcon();
}
/**
 * Change extension icon based on current state.
 */
function changeIcon() {
    let state = getState();
    iconPath = "./icon_32.png";
    if (state == 0 && !interruptDownloadOne) {
        iconPath = "./icon_disabled_32.png";
    } else if (state == 1) {
        // Warning
        iconPath = "./icon_warning_32.png";
    } else if (state == 2) {
        // Error
        iconPath = "./icon_error_32.png";
    }
    current_browser.browserAction.setIcon({
        path: iconPath
    });
}
start();
