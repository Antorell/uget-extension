/*
 * uget-chrome-wrapper is an extension to integrate uGet Download manager
 * with Google Chrome, Chromium, Vivaldi and Opera in Linux and Windows.
 *
 * Copyright (C) 2017  Gobinath
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

//console.log output inside the navigator main_frame dev tools console
// Uget-Integrator's "uget-integrator.py" basename(unquote(data['FileName'])) replace the %xx escapes
function extract() {
    let txt = '';
    let urls = [];
    let url = '';

    for (let i = 0; i < document.links.length; i++) {
        if ((/^https?:|^ftp:/i).test(document.links[i].protocol) && (/\.\w{1,10}$/).test(document.links[i].pathname)) {
            url = document.links[i].href;
            // Duplicate check.
            if (urls.indexOf(url) === -1) {
                urls.push(url);
            }
        }
    }
    urls = urls.filter(Boolean);
    txt = urls.join('\n');
    return txt
        ? { success: true, urls: txt } : { success: false, urls: "" };
}
extract();
