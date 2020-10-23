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
/*                                                                                      */
/*  The modifications work with Firefox + Uget + Aria2. Uget+Curl, or Chrome, untested. */
/*                                                                                      */
const EXTENSION_VERSION = "2.1.3";
const REQUIRED_INTEGRATOR_VERSION = "1.0.0";
const UgetWlDefaultMIME = ["3gp", "7z", "aac", "apk", "appx", "appxbundle", "avi", "bin", "bz2", "cab", "deb",
    "exe", "f4v", "flac", "flv", "gz", "iso", "lzh", "m4a", "m4p", "mkv", "mov", "mp3", "mp4", "mpeg", "mpg", "msi",
    "msixbundle", "ogg", "ogv", "rar", "rmvb", "rpm", "tar", "tgz", "wav", "webm", "wma", "wmv", "xz", "z", "zip"];
const UgetBlDefaultMIME = ["xml", "text", "rss", "json", "html", "javascript"];
const UgetBlDefaultURL = ["googleusercontent.com", "docs.google.com"];
// const UgetWlDefaultURL = [];
var interruptDownloadOne = true;
var ugetIntegratorNotFound = true;
var hostName;
var ugetIntegratorVersion;
var ugetVersion = '';
var chromeVersion;
var firefoxVersion;
var minFileSizeToInterrupt = 300 * 1024; // 300 kb
var current_browser;
// var filter = [];
var urlsToSkip = [];
var urlsToInterrupt = [];
var mimeToSkip = [];
var mimeToInterrupt = [];
var mediasInTab = {}; //
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
        current_browser = browser;
        hostName = 'com.ugetdm.firefox';
        current_browser.runtime.getBrowserInfo().then(
            function (info) {
                if (info.name === 'Firefox') {
                    // Convert version string to int
                    firefoxVersion = parseInt(info.version.replace(/[ab]\d+/, '').split('.')[0]);
                    chromeVersion = 33;
                }
            });
    } catch (ex) {
        // untested
        firefoxVersion = 0;
        current_browser = chrome;
        chromeVersion = /Chrome\/([0-9]+)/.exec(navigator.userAgent)[1];
        chromeVersion = parseInt(chromeVersion);
        hostName = 'com.ugetdm.chrome';
    }
    // Set keyboard shortcut listener
    current_browser.commands.onCommand.addListener(function (command) {
        if ("toggle-interruption" === command) {
            // Toggle
            setInterruptDownload(!interruptDownloadOne, true);
        }
    });
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
            urlsToSkip = items["uget-urls-exclude"].toLowerCase().split(/[\s,]+/).filter(item => item).concat(UgetBlDefaultURL);
        } else {
            current_browser.storage.sync.set({
                "uget-urls-exclude": ''
            });
            urlsToSkip = UgetBlDefaultURL;
        }
        // Read the storage for included keywords
        if (items["uget-urls-include"]) {
            urlsToInterrupt = items["uget-urls-include"].toLowerCase().split(/[\s,]+/).filter(item => item);
        } else {
            current_browser.storage.sync.set({
                "uget-urls-include": ''
            });
        }//Blacklist
        if (items["uget-mime-exclude"]) {
            mimeToSkip = items["uget-mime-exclude"].toLowerCase().split(/[\s,]+/).filter(item => item).concat(UgetBlDefaultMIME);
        } else {
            current_browser.storage.sync.set({
                "uget-mime-exclude": ''
            });
            mimeToSkip = UgetBlDefaultMIME;
        }
        // Read the storage for included keywords
        // Whitelist
        if (items["uget-mime-include"]) {
            mimeToInterrupt = items["uget-mime-include"].toLowerCase().split(/[\s,]+/).filter(item => item).concat(UgetWlDefaultMIME);
        } else {
            current_browser.storage.sync.set({
                "uget-mime-include": ''
            });
            mimeToInterrupt = UgetWlDefaultMIME;
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
        // let link_url = info.linkUrl;
        if (info.menuItemId === "download_with_uget") {
            message.URL = info.linkUrl;
            message.Referer = page_url;
            cookiesGetAll(info.linkUrl);
            // Promise.all([
            //     fetch(link_url).then(response => response.headers)
            // ]).then(([headResponse]) => {
            //     //message.FileSize = parseInt(headResponse.get('Content-Length'));
            //     message.FileName = stripFileName(headResponse.get('content-disposition'));
            //     cookiesGetAll(link_url);
            // }).catch((error) => {
            //     message.FileName = '';
            //     cookiesGetAll(link_url);
            // });
        } else if (info.menuItemId === "download_all_links_with_uget") {
            current_browser.tabs.executeScript(null, {
                file: 'extract.js'
            }, function (results) {
                // Do nothing
                if (results[0].success) {
                    message.URL = results[0].urls;
                    message.Referer = page_url;
                    message.Batch = true;
                    cookiesGetAll(page_url);
                }
            });
        } else if (info.menuItemId === "download_media_with_uget") {
            if (page_url.includes('/www.youtube.com/watch?v=')) {
                // Youtube
                message.URL = page_url;
                message.Referer = page_url;
                cookiesGetAll(page_url);
            } else {
                // Other videos
                var media_set = mediasInTab[tab['id']];
                if (media_set) {
                    var urls = Array.from(media_set);
                    var no_or_urls = urls.length;
                    if (no_or_urls == 1) {
                        message.URL = urls[0];
                        message.Referer = page_url;
                        cookiesGetAll(page_url);
                    } else if (no_or_urls > 1) {
                        message.URL = urls.join('\n');
                        message.Referer = page_url;
                        message.Batch = true;
                        cookiesGetAll(page_url);
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
    // debugger
    current_browser.downloads.onCreated.addListener(function (downloadItem) {
        message.URL = downloadItem.url || downloadItem.finalUrl;
        // uget-integrator not installed // that's a lot of OR. 
        if (ugetIntegratorNotFound || !interruptDownloadOne || !message.URL.match(/^(https?\:|ftp\:)/i) ||
            downloadItem.state.toString().toLowerCase() !== "in_progress" || isBlackListedURL(message.URL)) {
            clearMessage();
            return;
        }
        UgetFetchPromise(message.URL);
        let UfileExtension = stripExtension(message.URL);
        let ContentType = downloadItem.mime;
        // Do not interrupt blacklisted items
        if (/* isBlackListedURL(link_url) ||*/  isBlackListedContent(UfileExtension, ContentType) || message.FileSize < minFileSizeToInterrupt) {
            clearMessage();
            return;
            // Interrupt files based on UgetDefaultMIME, ignore files smaller than minFileSizeToInterrupt and blacklisted files.
        } else if (isWhiteListedURL(message.URL) || isWhiteListedContent(UfileExtension, ContentType)) {
            // Cancel the download// Erase the download from list
            current_browser.downloads.cancel(downloadItem.id);
            current_browser.downloads.erase({
                id: downloadItem.id
            });
            message.Referer = downloadItem.referrer;
            cookiesGetAll(message.URL);
        } else {
            return;
        }
    })
    current_browser.webRequest.onHeadersReceived.addListener(function (details) {
        let ContentType = 'text/html';
        // uget-integrator not installed// HTTP response is not OK
        if (ugetIntegratorNotFound || details.statusCode != 200 || isBlackListedURL(details.url)) {
            clearMessage();
            return {
                responseHeaders: details.responseHeaders
            };
        }
        ContentType = details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-type').value;
        if (!ContentType.includes('text/html')) {
            let interruptDownloadTwo = false;
            message.URL = details.url;
            let UfileExtension = stripExtension(details.url);
            try {
                message.FileName = stripFileName(details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-disposition').value);
            } catch (error) {
                message.FileName = '';
            }
            try {
                message.FileSize = parseInt(details.responseHeaders.find(({ name }) => name.toLowerCase() === 'content-length').value);
            } catch (error) {
                //// untested/barely tested, should fix akamai no content-length. Probably breaks a tons of other things.
                if (details.responseHeaders.find(({ name }) => name.toLowerCase() === 'accept-ranges').value === "bytes") {
                    message.FileSize = minFileSizeToInterrupt + 1;
                } else {
                    clearMessage();
                    return;
                }
            }
            // Do not interrupt blacklisted items
            if (/* isBlackListedURL(details.url) || */ isBlackListedContent(UfileExtension, ContentType) || message.FileSize < minFileSizeToInterrupt) {
                interruptDownloadTwo = false;
                clearMessage();
                return {
                    responseHeaders: details.responseHeaders
                };
            } else if (isWhiteListedURL(details.url) || isWhiteListedContent(UfileExtension, ContentType)) {
                interruptDownloadTwo = true;
            }
            /// filter?????
            if (interruptDownloadTwo && interruptDownloadOne) {
                // for (let i = 0; i < filter.length; i++) {
                //     if (filter[i] != "" && ContentType.lastIndexOf(filter[i]) != -1) {
                //         return {
                //             responseHeaders: details.responseHeaders
                //         };
                //     }
                // }
                // if (details.method != "POST") {
                //     message.PostData = '';
                // }
                if (details.originUrl) {
                    message.Referer = details.originUrl;
                }
                cookiesGetAll(message.URL);
                //let scheme = /^https/.test(details.url) ? 'https' : 'http'; //???????
                // if (chromeVersion >= 35 || firefoxVersion >= 51) {
                //     return {
                //         redirectUrl: "javascript:"
                //     };
                /// Manifest: Firefox min version = 57. Chrome min version = 45
                // }
                // else if (details.frameId === 0) {
                //     current_browser.tabs.update(details.tabId, {
                //         url: "javascript:"
                //     });
                //     let responseHeaders = details.responseHeaders.filter(function (header) {
                //         let name = header.name.toLowerCase();
                //         return name !== 'content-type' &&
                //             name !== 'x-content-type-options' &&
                //             name !== 'content-disposition';
                //     }).concat([{
                //         name: 'Content-Type',
                //         value: 'text/plain'
                //     }, {
                //         name: 'X-Content-Type-Options',
                //         value: 'nosniff'
                //     }
                //     ]);
                //     return {
                //         responseHeaders: responseHeaders
                //     };
                // }
                return {
                    redirectUrl: "javascript:",//??
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
        ///?????
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
    message.PostData = '';
    message.Batch = false;
}
/**
 * Extract the POST parameters from a form data.
 // To do what????
function postParams(source) {
    let array = [];
    for (let key in source) {
        array.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
    }
    return array.join('&');
} */
/**
 * Get the file size of given URL.
 * @param {string} url
 */
function UgetFetchPromise(url) {
    Promise.all([
        fetch(url).then(response => response.headers)
    ]).then(([headResponse]) => {
        message.FileSize = parseInt(headResponse.get('content-length'));
        message.FileName = stripFileName(headResponse.get('content-disposition'));
    }).catch((_error) => {
        message.FileSize = minFileSizeToInterrupt;
        message.FileName = '';
    });
}
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
    return FileNameExt.toLowerCase();
}
/**
 * Extract the root of a URL.
 */
function stripRootURL(url) {
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
        'url': stripRootURL(url)
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
        urlsToSkip = UgetBlDefaultURL;
    } else {
        urlsToSkip = exclude.split(/[\s,]+/).concat(UgetBlDefaultURL)
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
        mimeToSkip = UgetBlDefaultMIME;
    } else {
        mimeToSkip = exclude.split(/[\s,]+/).concat(UgetBlDefaultMIME);
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
        mimeToInterrupt = UgetWlDefaultMIME;
    } else {
        mimeToInterrupt = include.split(/[\s,]+/).concat(UgetWlDefaultMIME);
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
    let blackListed = false;
    try {
        url = stripRootURL(url)
        for (let keyword of urlsToSkip) {
            if (url.includes(keyword)) {
                blackListed = true;
                break;
            }
        }
    } catch (error) { blackListed = true; }
    return blackListed;
}
function isBlackListedContent(extension, contype) {
    let blackListed = false;
    try {
        if (extension || contype) {
            for (let keyword of mimeToSkip) {
                if (extension.includes(keyword.toString()) || contype.includes(keyword.toString())) {
                    blackListed = true;
                    break;
                }
            }
        }
    } catch (error) { blackListed = false; }
    return blackListed;
}
/**
 * Check whether to interrupt the given url or not.
 */
function isWhiteListedURL(url) {
    let whiteListed = false;
    try {
        url = stripRootURL(url);
        for (let keyword of urlsToInterrupt) {
            if (url.includes(keyword)) {
                whiteListed = true;
                break;
            }
        }
        //}
    } catch (error) { whiteListed = false; }
    return whiteListed;
}
function isWhiteListedContent(extension, contype) {
    let whiteListed = false;
    try {
        if (extension || contype) {
            for (let keyword of mimeToInterrupt) {
                if (extension.includes(keyword.toString()) || contype.includes(keyword.toString())) {
                    whiteListed = true;
                    break;
                }
            }
        }
    } catch (error) { whiteListed = false; }
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
