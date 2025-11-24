FROM node:18

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip

# Set python alias
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
