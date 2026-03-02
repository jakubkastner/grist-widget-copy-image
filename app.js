let attachmentId = null;
let docToken = null;
let docBaseUrl = null;

function ensureCanvasToBlobPolyfill() {
    if (!HTMLCanvasElement.prototype.toBlob) {
        HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
            const dataURL = this.toDataURL(type, quality);
            const byteString = atob(dataURL.split(',')[1]);
            const mimeString = dataURL.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            callback(new Blob([ab], { type: mimeString }));
        };
    }
}

function domReady() {
    return new Promise(resolve => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        }
        else {
            resolve();
        }
    });
}

async function main() {
    ensureCanvasToBlobPolyfill();
    await domReady();

    const btnEl = document.getElementById('copyBtn');

    if (!btnEl || !statusEl) {
        console.warn('Missing #copyBtn or #status elements in DOM.');
        return;
    }

    grist.ready({
        columns: [
            { name: 'MyImageColumn', title: 'Select Image Column', type: 'Attachments' }
        ],
        requiredAccess: 'full'
    });

    grist.docApi.getAccessToken({ readOnly: true }).then(({ token, baseUrl }) => {
        docToken = token;
        docBaseUrl = baseUrl;
    }).catch(err => {
        console.error('Token error:', err);
        changeStatus('❌ Cannot get grist token.', true);
    });

    grist.onRecord(function (record, mappings) {
        if (!mappings || !mappings.MyImageColumn) {
            return;
        }
        const files = record[mappings.MyImageColumn];

        if (Array.isArray(files) && files.length > 0 && files[0]) {
            attachmentId = files[0];
            changeStatus();
        }
        else {
            attachmentId = null;
            changeStatus('❌ No image found.', true);
        }
    });

    function changeStatus(text = '📋 Copy image', disabled = false) {
        btnEl.disabled = disabled;
        btnEl.innerHTML = text;
    }

    // Function to convert Blob to PNG Blob using Canvas
    async function convertToPng(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((pngBlob) => {
                    URL.revokeObjectURL(url);
                    if (pngBlob) resolve(pngBlob);
                    else reject(new Error('Canvas conversion failed'));
                }, 'image/png');
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Image load failed'));
            };

            img.src = url;
        });
    }

    btnEl.addEventListener('click', async () => {

        if (!attachmentId) {
            return;
        }

        if (!docToken) {
            changeStatus('⏳ Waiting for grist token…', true);
            try {
                const { token, baseUrl } = await grist.docApi.getAccessToken({ readOnly: true });
                docToken = token; docBaseUrl = baseUrl;
                changeStatus();
            }
            catch (e) {
                changeStatus('❌ Cannot get grist token.', true);
                return;
            }
        }
        try {
            changeStatus('⏳ Downloading & converting image…', true);

            const url = `${docBaseUrl}/attachments/${attachmentId}/download?auth=${docToken}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Download failed');
            }

            let blob = await response.blob();

            // If it is NOT a PNG (e.g. JPEG), convert it!
            if (blob.type !== 'image/png') {
                try {
                    blob = await convertToPng(blob);
                }
                catch (convErr) {
                    changeStatus('⚠️ Image conversion failed.', true);
                    return;
                }
            }

            // Now we can safely write 'image/png' to clipboard
            if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);

                changeStatus('✅ Image copied');
                setTimeout(() => changeStatus(), 2000);
            }
            else {
                changeStatus('⚠️ Clipboard API is not accessable.', true);
            }
        } catch (err) {
            console.error(err);
            changeStatus('❌ Error: ' + err.message, true);
        }

    });
}

main();