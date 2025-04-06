const express = require('express');
const { VK } = require('vk-io');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const app = express();
const port = 3000;

const ACCESS_TOKEN = ''; // Ваш токен
const vk = new VK({ token: ACCESS_TOKEN });

// Создаем папки для временных файлов
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'img')));
app.use(express.json());

// Функция для проверки доступности ffmpeg
function checkFFmpeg() {
    return new Promise((resolve, reject) => {
        exec('ffmpeg -version', (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg не найден или не установлен');
                reject(new Error('FFmpeg не найден. Убедитесь, что ffmpeg установлен и добавлен в PATH'));
            } else {
                console.log('FFmpeg доступен:', stdout.split('\n')[0]);
                resolve();
            }
        });
    });
}

// Функция для безопасного удаления файлов
function cleanupFiles(files) {
    files.forEach(file => {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                console.log('Удален временный файл:', file);
            }
        } catch (err) {
            console.error('Ошибка при удалении файла', file, err);
        }
    });
}

app.post('/download-audio', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Не указана ссылка на аудио' });
    }

    const timestamp = Date.now();
    const tempFile = path.join(tempDir, `temp_${timestamp}.mp3`);
    const outputFile = path.join(tempDir, `output_${timestamp}.mp3`);

    try {
        // Проверяем доступность ffmpeg
        await checkFFmpeg();

        // Извлекаем owner_id и audio_id из ссылки
        const match = url.match(/audio(-?\d+)_(\d+)/);
        if (!match) {
            return res.status(400).json({ error: 'Неправильный формат ссылки на аудио' });
        }

        const ownerId = match[1];
        const audioId = match[2];
        console.log('Извлеченные данные:', { ownerId, audioId });

        // Получаем информацию об аудио
        const response = await vk.api.audio.getById({ audios: `${ownerId}_${audioId}` });
        const audio = response[0];

        if (!audio || !audio.url) {
            return res.status(404).json({ error: 'Аудио не найдено или недоступно для скачивания' });
        }

        console.log('Информация об аудио:', { title: audio.title, artist: audio.artist, url: audio.url });

        if (audio.url.includes('.m3u8')) {
            console.log('Обнаружен .m3u8 плейлист');
            await processM3u8(audio, tempFile, outputFile, res);
        } else {
            console.log('Прямая ссылка на аудио');
            await processDirectAudio(audio, tempFile, outputFile, res);
        }
    } catch (error) {
        console.error('Ошибка при обработке аудио:', error);
        cleanupFiles([tempFile, outputFile]);
        res.status(500).json({ error: error.message || 'Не удалось обработать аудио' });
    }
});

async function processM3u8(audio, tempFile, outputFile, res) {
    try {
        const m3u8Content = await axios.get(audio.url).then(res => res.data);
        const baseUrl = audio.url.substring(0, audio.url.lastIndexOf('/') + 1);
        const lines = m3u8Content.split('\n');
        
        const fragmentUrls = [];
        let currentKeyUri = null;
        let currentIV = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-KEY:')) {
                const keyMatch = line.match(/URI="([^"]+)"/);
                if (keyMatch) currentKeyUri = new URL(keyMatch[1], baseUrl).href;
                const ivMatch = line.match(/IV=([^,]+)/);
                currentIV = ivMatch ? Buffer.from(ivMatch[1].replace(/0x/, ''), 'hex') : Buffer.alloc(16, 0);
            } else if (line.endsWith('.ts') || line.includes('.ts?')) {
                fragmentUrls.push({
                    url: new URL(line, baseUrl).href,
                    keyUri: currentKeyUri,
                    iv: currentIV,
                });
            }
        }

        if (fragmentUrls.length === 0) {
            throw new Error('Фрагменты .ts не найдены в .m3u8');
        }

        // Скачиваем ключи шифрования
        const keys = {};
        for (const fragment of fragmentUrls) {
            if (fragment.keyUri && !keys[fragment.keyUri]) {
                const keyResponse = await axios.get(fragment.keyUri, { responseType: 'arraybuffer' });
                keys[fragment.keyUri] = keyResponse.data;
            }
        }

        // Скачиваем и расшифровываем фрагменты
        const writeStream = fs.createWriteStream(tempFile);
        
        for (const fragment of fragmentUrls) {
            try {
                const response = await axios.get(fragment.url, {
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                
                if (fragment.keyUri) {
                    try {
                        const decipher = crypto.createDecipheriv('aes-128-cbc', keys[fragment.keyUri], fragment.iv);
                        const decryptedData = Buffer.concat([decipher.update(response.data), decipher.final()]);
                        writeStream.write(decryptedData);
                    } catch (decryptError) {
                        console.error('Ошибка при расшифровке фрагмента, записываем как есть');
                        writeStream.write(response.data);
                    }
                } else {
                    writeStream.write(response.data);
                }
            } catch (fragmentError) {
                console.error('Ошибка при скачивании фрагмента', fragment.url, fragmentError);
            }
        }

        writeStream.end();
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        await convertAudio(tempFile, outputFile, audio, res);
    } catch (error) {
        throw error;
    }
}

async function processDirectAudio(audio, tempFile, outputFile, res) {
    try {
        const response = await axios.get(audio.url, { responseType: 'arraybuffer' });
        fs.writeFileSync(tempFile, response.data);
        await convertAudio(tempFile, outputFile, audio, res);
    } catch (error) {
        throw error;
    }
}

async function convertAudio(inputFile, outputFile, audio, res) {
    return new Promise((resolve, reject) => {
        // Экранируем специальные символы в названии и исполнителе для команды ffmpeg
        const safeTitle = audio.title.replace(/"/g, '\\"');
        const safeArtist = audio.artist.replace(/"/g, '\\"');
        
        const ffmpegCommand = `ffmpeg -i "${inputFile}" -c:a libmp3lame -q:a 2 -write_xing 1 -id3v2_version 3 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputFile}"`;
        
        console.log('Выполняем команду ffmpeg:', ffmpegCommand);
        
        exec(ffmpegCommand, (error, stdout, stderr) => {
            if (error) {
                console.error('Ошибка ffmpeg:', stderr);
                return reject(new Error('Не удалось конвертировать файл'));
            }
            
            console.log('Конвертация завершена успешно');
            
            const downloadName = `${audio.artist} - ${audio.title}.mp3`.replace(/[<>:"\/\\|?*]/g, '_');
            res.download(outputFile, downloadName, (err) => {
                if (err) {
                    console.error('Ошибка при отправке файла:', err);
                    return reject(err);
                }
                cleanupFiles([inputFile, outputFile]);
                resolve();
            });
        });
    });
}

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
    checkFFmpeg().catch(err => console.error(err.message));
});
