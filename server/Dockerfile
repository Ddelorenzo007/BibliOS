# Usamos una imagen oficial de Node.js ligera
FROM node:18-alpine

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos primero los archivos de dependencias para aprovechar la caché de Docker
COPY package*.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código del servidor
COPY . .

# Exponemos el puerto que usa Express (asumiendo que es el 3000)
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]