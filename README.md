# Инструкция

```bash
## Вам потребуется
# Node.js v22.14.0 или новее
# FFmpeg (для обработки аудио)
# Токен доступа VK API

## Установка npm-пакетов
# Использование команды:
npm ci 
# Установка зависимостей для проекта из файла package-lock.json

## Установка FFmpeg
# Для Windows (Удобно через Chocolatey)

## Для получения токена VK 
# vkhost.github.io > VK Admin > Даем разрешения, получаем токен. 
# Копируйте токен правильно, без последних значений &expires_in=0&user_id=99999999999
# И начиная с vk1.a....
Токен никому не сообщаем! 

# Вставьте токен в файл index.js, сюда: 
const ACCESS_TOKEN = ''; // Ваш токен
# между кавычками ''.

## Запускаем 🚀
# Открываем терминал в директории проекта
# Прописываем node index.js
Сервер запустится на http://localhost:3000 
# Откройте в удобном для вас баразуре
# Вставьте ссылку на аудио из ВК в формате (https://vk.com/audio123456789_123456789)
Нажмите "Скачать музыку" браузер предложит сохранить mp3 файл. 

Установка chocolotay 🍫
# Пункт - 1. Установка пакетного менеджера Chocolotay
• Запускаем PowerShell от имени администратора
• Введите поочередно команды:
1) Get-ExecutionPolicy
2) Set-ExecutionPolicy Bypass -Scope Process -Force
3) Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
