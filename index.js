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
    fs.mkdirSync(tempDir);
}

// Обслуживаем статические файлы из папки 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Обслуживаем статические файлы из папки 'img'
app.use(express.static(path.join(__dirname, 'img')));

app.use(express.json());

app.post('/download-audio', async (req, res) => {
    const { url } = req.body;
    const tempFile = path.join(tempDir, `temp_${Date.now()}.mp3`);
    const outputFile = path.join(tempDir, `output_${Date.now()}.mp3`);

    try {
        // Извлекаем owner_id и audio_id из ссылки
        const match = url.match(/audio(-?\d+)_(\d+)/);
        if (!match) {
            console.error('Неправильный формат ссылки на аудио');
            return res.status(400).json({ error: 'Неправильный формат ссылки на аудио' });
        }

        const ownerId = match[1];
        const audioId = match[2];
        console.log('Извлеченные данные:', { ownerId, audioId });

        // Получаем информацию об аудио
        const response = await vk.api.audio.getById({ audios: `${ownerId}_${audioId}` });
        const audio = response[0];

        if (!audio || !audio.url) {
            console.error('Аудио не найдено или недоступно для скачивания');
            return res.status(404).json({ error: 'Аудио не найдено или недоступно для скачивания' });
        }

        console.log('Информация об аудио:', audio);

        // Если ссылка ведет на .m3u8, обрабатываем её
        if (audio.url.includes('.m3u8')) {
            console.log('Обнаружен .m3u8 плейлист');
            const m3u8Content = await axios.get(audio.url).then(res => res.data);

            // Выводим содержимое .m3u8 для отладки
            console.log('Содержимое .m3u8:', m3u8Content);

            // Извлекаем базовый URL для относительных ссылок
            const baseUrl = audio.url.substring(0, audio.url.lastIndexOf('/') + 1);

            // Извлекаем ссылки на фрагменты .ts и ключи шифрования
            const lines = m3u8Content.split('\n');
            const fragmentUrls = [];
            let currentKeyUri = null;
            let currentIV = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('#EXT-X-KEY:')) {
                    const keyMatch = line.match(/URI="([^"]+)"/);
                    if (keyMatch) {
                        currentKeyUri = new URL(keyMatch[1], baseUrl).href;
                    }
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

            console.log('Найдены фрагменты:', fragmentUrls);

            if (fragmentUrls.length === 0) {
                console.error('Фрагменты .ts не найдены в .m3u8');
                return res.status(404).json({ error: 'Фрагменты .ts не найдены в .m3u8' });
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
                console.log('Скачивание фрагмента:', fragment.url);
                const response = await axios.get(fragment.url, {
                    responseType: 'arraybuffer',
                    timeout: 10000 // 10 секунд на фрагмент
                });
                if (fragment.keyUri) {
                    try {
                        // Расшифровка AES-128-CBC
                        const decipher = crypto.createDecipheriv('aes-128-cbc', keys[fragment.keyUri], fragment.iv);
                        const decryptedData = Buffer.concat([decipher.update(response.data), decipher.final()]);
                        writeStream.write(decryptedData);
                    } catch (decryptError) {
                        console.error('Ошибка при расшифровке фрагмента:', decryptError);
                        // Если расшифровка не удалась, записываем незашифрованные данные
                        writeStream.write(response.data);
                    }
                } else {
                    // Если фрагмент не зашифрован, записываем как есть
                    writeStream.write(response.data);
                }
            }

            writeStream.end();

            await new Promise((resolve, reject) => {
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            // Конвертируем файл в MP3 и добавляем метаданные
            exec(`ffmpeg -i ${tempFile} -c:a libmp3lame -q:a 2 -write_xing 1 -id3v2_version 3 -metadata title="${audio.title}" -metadata artist="${audio.artist}" ${outputFile}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Ошибка при конвертации файла:', error);
                    return res.status(500).json({ error: 'Не удалось конвертировать файл' });
                }

                // Отправляем конвертированный файл
                res.download(outputFile, `${audio.artist} - ${audio.title}.mp3`, (err) => {
                    if (err) {
                        console.error('Ошибка при отправке файла:', err);
                        res.status(500).json({ error: 'Не удалось отправить файл' });
                    }
                    // Удаляем временные файлы после отправки
                    [tempFile, outputFile].forEach(file => {
                        if (fs.existsSync(file)) {
                            fs.unlinkSync(file);
                        }
                    });
                });
            });

        } else {
            // Если ссылка ведет напрямую на аудио, отправляем её
            console.log('Прямая ссылка на аудио:', audio.url);
            const tempFile = path.join(tempDir, `temp_${Date.now()}.mp3`);
            const outputFile = path.join(tempDir, `output_${Date.now()}.mp3`);

            const response = await axios.get(audio.url, { responseType: 'arraybuffer' });
            fs.writeFileSync(tempFile, response.data);

            // Конвертируем файл в MP3 и добавляем метаданные
            exec(`ffmpeg -i ${tempFile} -c:a libmp3lame -q:a 2 -write_xing 1 -id3v2_version 3 -metadata title="${audio.title}" -metadata artist="${audio.artist}" ${outputFile}`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Ошибка при конвертации файла:', error);
                    return res.status(500).json({ error: 'Не удалось конвертировать файл' });
                }

                // Отправляем конвертированный файл
                res.download(outputFile, `${audio.artist} - ${audio.title}.mp3`, (err) => {
                    if (err) {
                        console.error('Ошибка при отправке файла:', err);
                        res.status(500).json({ error: 'Не удалось отправить файл' });
                    }
                    // Удаляем временные файлы после отправки
                    [tempFile, outputFile].forEach(file => {
                        if (fs.existsSync(file)) {
                            fs.unlinkSync(file);
                        }
                    });
                });
            });
        }
    } catch (error) {
        console.error('Ошибка при получении аудио:', error);
        res.status(500).json({ error: 'Не удалось получить информацию об аудио' });
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});
