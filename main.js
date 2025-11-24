const http = require('http');
const path = require('path');
const fs = require('fs');
const { program } = require('commander');
const express = require('express');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

program
    .requiredOption('-p, --port <port>', 'port')
    .requiredOption('-h, --host <host>', 'host')
    .requiredOption('-c, --cache <path>', 'path to cache');

program.parse(process.argv);
const options = program.opts();

if (!fs.existsSync(options.cache)) {
    console.log(`Directory ${options.cache} does not exist. Creating...`);
    fs.mkdirSync(options.cache, { recursive: true });
}

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, options.cache),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

let inventory = [];
let idCounter = 1;

/* ---------------------- SWAGGER CONFIG ---------------------- */

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Inventory Service API",
            version: "1.0.0",
            description: "API documentation for the inventory service"
        }
    },
   apis: ["./*.js"]

};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* ---------------------- END SWAGGER -------------------------- */


/**
 *@openapi
 * /register:
 *   post:
 *     summary: Register a new inventory item
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: inventory_name
 *         required: true
 *       - in: formData
 *         name: description
 *       - in: formData
 *         name: photo
 *         type: file
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Name is required */

 
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;

    if (!inventory_name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    const newItem = {
        id: idCounter++,
        name: inventory_name,
        description: description || '',
        photo: req.file ? req.file.filename : null,
        photoUrl: req.file ? `http://${options.host}:${options.port}/inventory/${idCounter - 1}/photo` : null
    };

    inventory.push(newItem);
    res.status(201).json({ message: 'Created', item: newItem });
});


/** 
 * @openapi
 * /inventory:
 *   get:
 *     summary: Get all inventory items
 *     responses:
 *       200:
 *         description: List of items
 */
app.get('/inventory', (req, res) => {
    res.json(
        inventory.map(item => ({
            ...item,
            photoUrl: item.photo
                ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
                : null
        }))
    );
});
/** 
 * @openapi
 * /inventory/{id}:
 *   get:
 *     summary: Get item by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: Item found
 *       404:
 *         description: Not found
 */
app.get('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id == req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    res.json({
        ...item,
        photoUrl: item.photo
            ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
            : null
    });
});


/** 
 * @openapi
 * /inventory/{id}:
 *   put:
 *     summary: Update item info
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.put('/inventory/:id', (req, res) => {
    const item = inventory.find(i => i.id == req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const { name, description } = req.body;
    if (name) item.name = name;
    if (description) item.description = description;

    res.json({ message: 'Updated', item });
});


/** 
 * @openapi
 * /inventory/{id}/photo:
 *   get:
 *     summary: Get item photo
 *     responses:
 *       200:
 *         description: Photo returned
 *       404:
 *         description: Photo not found
 */
app.get('/inventory/:id/photo', (req, res) => {
    const item = inventory.find(i => i.id == req.params.id);
    if (!item || !item.photo) return res.status(404).json({ error: 'Photo not found' });

    const imgPath = path.join(options.cache, item.photo);
    res.setHeader('Content-Type', 'image/jpeg');
    fs.createReadStream(imgPath).pipe(res);
});


/** 
 * @openapi
 * /inventory/{id}/photo:
 *   put:
 *     summary: Update item photo
 *     consumes:
 *       - multipart/form-data
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
    const item = inventory.find(i => i.id == req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    if (!req.file) {
        return res.status(400).json({ error: 'Photo file is required for update' });
    }
    item.photo = req.file.filename;
    res.json({
        message: 'Photo updated',
        photoUrl: `http://${options.host}:${options.port}/inventory/${item.id}/photo`
    });
});


/** 
 * @openapi
 * /inventory/{id}:
 *   delete:
 *     summary: Delete item
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
app.delete('/inventory/:id', (req, res) => {
    const index = inventory.findIndex(i => i.id == req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });

    inventory.splice(index, 1);
    res.json({ message: 'Deleted' });
});


/** 
 * @openapi
 * /RegisterForm.html:
 *   get:
 *     summary: Serve registration form
 */
app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'RegisterForm.html'));
});


/** 
 * @openapi
 * /SearchForm.html:
 *   get:
 *     summary: Serve search form
 */
app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'SearchForm.html'));
});


/** 
 * @openapi
 * /search:
 *   post:
 *     summary: Search for an item
 *     consumes:
 *       - application/x-www-form-urlencoded
 *     responses:
 *       200:
 *         description: Found
 *       404:
 *         description: Not found
 */
app.post('/search', (req, res) => {
    const { id, has_photo } = req.body;

    const item = inventory.find(i => i.id == id);
    if (!item) return res.status(404).send('Not found');

    const responseItem = {
        id: item.id,
        name: item.name,
        description: item.description,
        photoUrl: has_photo === 'on' && item.photo
            ? `http://${options.host}:${options.port}/inventory/${item.id}/photo`
            : null
    };

    res.json(responseItem);
});

app.get("/register", (req, res) => {
    res.redirect("/RegisterForm.html");
});
// Open search form via GET
app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'SearchForm.html'));
});
// 405 for everything else
app.use((req, res) => {
    res.status(405).json({ error: "Method Not Allowed" });
});

// Start server
const server = http.createServer(app);
server.listen(options.port, options.host, () => {
    console.log(`Server running at http://${options.host}:${options.port}`);
});