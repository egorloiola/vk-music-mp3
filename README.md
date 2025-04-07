# Инструкция

```bash
## Вам потребуется
# Node.js v22.14.0 или новее
# FFmpeg (для обработки аудио)
# Токен доступа VK API

## Если у вас не установлен git, node js, FFmpeg 
# Для Windows удобно это сделать через пакетный менеджер Chocolatey
# В конце файла есть ссылка на видеоинструкцию.

## Если крато:
# Устанавливайте Chocolatey, инструкция есть в конце файла.
# Запустите cmd от имени администратора, введите команду:
 # choco install git nvm ffmpeg-full -y
# После скачайте репозиторий, запустите cmd, находясь в папке vk-music-mp3
 # Введите поочередно команды, дожидаясь их выполнения:
 # nvm install 22.14.0
 # nvm use 22.14.0
 # npm ci

## Для получения токена VK 
# vkhost.github.io > VK Admin > Даем разрешения, получаем токен. 
# Копируйте токен правильно, без последних значений &expires_in=0&user_id=99999999999
# И начиная с vk1.a....
Токен никому не сообщаем! 
# Вставьте токен в файл index.js, сюда: 
const ACCESS_TOKEN = ''; // Ваш токен
# вставляем между кавычками ''.
Сохраните изменение в файле.

## Запускаем 🚀
# Открываем терминал в директории проекта
# Устанавливаем зависимости из файла package-lock.json командой: npm ci
# Запускаем командой: node index.js
Сервер запустится на http://localhost:3000 
# Откройте в удобном для вас баразуре
# Вставьте ссылку на аудио из ВК в формате (https://vk.com/audio123456789_123456789)
Нажмите "Скачать музыку" браузер предложит сохранить mp3 файл. 

--------------------------------------------------------
## Есть видео инструкция на youtube как развернуть с 0 для Windows: 
https://www.youtube.com/watch?v=mKqXv8lYfq4

## Пункт - 1. Установка пакетного менеджера Chocolotay 🍫
# Запускаем PowerShell от имени администратора
# Введите поочередно команды:
1) Get-ExecutionPolicy
2) Set-ExecutionPolicy Bypass -Scope Process -Force
3) Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

