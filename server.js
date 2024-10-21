const express = require('express'); 
const cors = require('cors'); 
const admin = require('firebase-admin'); 
const multer = require('multer'); 
const { v4: uuidv4 } = require('uuid'); 

const serviceAccount = require('./spa-salon-tg-firebase-adminsdk-fjzow-ff14895fab.json');

admin.initializeApp({ 
  credential: admin.credential.cert(serviceAccount), 
  storageBucket: 'spa-salon-tg.appspot.com' });

const db = admin.firestore(); 
const bucket = admin.storage().bucket(); 
const app = express(); 
const port = process.env.PORT || 3000;

app.use(cors()); app.use(express.json());

const storage = multer.memoryStorage(); 
const upload = multer({ storage });


app.post('/upload', upload.array('files'), async (req, res) => 
      { const { studioName, title, description } = req.body; 
          
      const files = req.files;
          
      if (!studioName || !title || !description || !files) 
          { return res.status(400).json({ error: 'Не все поля заполнены' }); 
        }
       
      try { 
        const fileUrls = [];
             
        for (const file of files) {
          const fileName = `${uuidv4()}_${file.originalname}`;
          const fileUpload = bucket.file(fileName);

          const stream = fileUpload.createWriteStream({
             metadata: {
                contentType: file.mimetype,
             }
          });

          stream.end(file.buffer);
     
      await new Promise((resolve, reject) => {
        stream.on('finish', resolve);
        stream.on('error', reject);
      });

      const [url] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-01-2500',
      });

      fileUrls.push(url);
    }

    await db.collection('instructions').doc(studioName).collection('titles').doc(title).set({
      studioName,
      title,
      description,
      fileUrls
    });

    res.json({ message: 'Инструкция успешно загружена!' });
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

app.delete('/delete-instruction', async (req, res) => {
    const { studioName, instructionName } = req.body;

    if (!studioName || !instructionName) {
        return res.status(400).json({ error: 'Название студии и инструкции должны быть указаны' });
    }

    try {
        await db.collection('instructions').doc(studioName.toLowerCase()).collection('titles').doc(instructionName).delete();
        res.json({ message: 'Инструкция удалена!' });
    } catch (error) {
        console.error('Ошибка удаления инструкции:', error);
        res.status(500).json({ error: 'Ошибка удаления инструкции' });
    }
});

app.get('/all-instructions', async (req, res) => {
    try {
        const instructionsRef = db.collectionGroup('titles');
        const snapshot = await instructionsRef.get();
        
        const instructions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            instructions.push({
                studioName: doc.ref.parent.parent.id,
                title: data.title,
                description: data.description,
                fileUrls: data.fileUrls || []
            });
        });

        res.json(instructions);
    } catch (error) {
        console.error('Ошибка получения инструкций:', error);
        res.status(500).json({ error: 'Ошибка получения инструкций' });
    }
});



app.get('/search', async (req, res) => {
  const query = req.query.query.toLowerCase();
  
  if (!query) {
    return res.status(400).json({ error: 'Необходимо ввести фразу для поиска' });
  }

  try {
    const instructionsRef = db.collectionGroup('titles');
    const snapshot = await instructionsRef.get();

    const results = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.title.toLowerCase().includes(query)) {
        results.push({
          title: data.title,
          description: data.description,
          fileUrl: data.fileUrls[0]
        });
      }
    });

    res.json(results);
  } catch (error) {
    console.error('Ошибка поиска инструкций:', error);
    res.status(500).json({ error: 'Ошибка поиска инструкций' });
  }
});

app.post('/events', async (req, res) => {
  const { studioName, name, time, description } = req.body;

  if (!studioName || !name || !time || !description) {
    return res.status(400).json({ error: 'Not all fields are filled' });
  }

  try {
    const studioRef = db.collection('events').doc(studioName);
    const eventRef = studioRef.collection('events').doc(name);

    await eventRef.set({
      name,
      time,
      description,
    });

    res.json({ message: 'Event created successfully!' });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Error creating event' });
  }
});

app.get('/events', async (req, res) => {
  const studioName = req.query.studioName;

  if (!studioName) {
    return res.status(400).json({ error: 'Необходимо указать studioName' });
  }

  try {
    const eventsRef = db.collection('events').doc(studioName).collection('events');
    const snapshot = await eventsRef.get();

    let events = [];

    snapshot.forEach(doc => {
      events.push({
        id: doc.id,
        ...doc.data()
      });
    });

    events.sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json(events);
  } catch (error) {
    console.error('Ошибка получения событий:', error);
    res.status(500).json({ error: 'Ошибка получения событий' });
  }
});

app.get('/all-events', async (req, res) => {
    try {
        const eventsRef = db.collectionGroup('events');
        const snapshot = await eventsRef.get();
        
        let events = [];

        snapshot.forEach(doc => {
            const eventData = doc.data();
            const studioName = doc.ref.parent.parent.id;
            events.push({
                ...eventData,
                studioName 
            });
        });

        events.sort((a, b) => new Date(a.time) - new Date(b.time));

        res.json(events);
    } catch (error) {
        console.error('Ошибка получения всех событий:', error);
        res.status(500).json({ error: 'Ошибка получения всех событий' });
    }
});



app.delete('/delete-event', async (req, res) => {
    const { studioName, eventName } = req.body;

    try {
        await db.collection('events').doc(studioName).collection('events').doc(eventName).delete();
        
        res.json({ message: 'Событие удалено!' });
    } catch (error) {
        console.error('Ошибка удаления события:', error);
        res.status(500).json({ error: 'Ошибка удаления события' });
    }
});



app.post('/admins', async (req, res) => {
    const { adminId } = req.body;

    try {
        const adminsRef = db.collection('admins');
        const snapshot = await adminsRef.get();
        if (snapshot.docs.some(doc => doc.id === adminId)) {
            return res.status(400).json({ error: 'Этот админ уже существует!' });
        }

        await adminsRef.doc(adminId).set({});

        res.json({ message: 'Админ успешно создан!' });
    } catch (error) {
        console.error('Ошибка при добавлении админа:', error);
        res.status(500).json({ error: 'Ошибка при добавлении админа' });
    }
});


app.get('/get-admins', async (req, res) => {
    try {
        const adminsRef = db.collection('admins');
        const snapshot = await adminsRef.get();
        const admins = snapshot.docs.map(doc => doc.id);
        res.json({ admins });
    } catch (error) {
        console.error('Ошибка при получении администраторов:', error);
        res.status(500).json({ error: 'Ошибка при получении администраторов' });
    }
});

app.delete('/admins/:adminId', async (req, res) => {
    const adminId = req.params.adminId;

    try {
        await db.collection('admins').doc(adminId).delete();

        res.json({ message: 'Администратор успешно удален!' });
    } catch (error) {
        console.error('Ошибка при удалении администартора:', error);
        res.status(500).json({ error: 'Ошибка при удалении администратора' });
    }
});


app.post('/studios', async (req, res) => {
    const { studioName } = req.body;

    try {
        const studiosRef = db.collection('studios');
        const snapshot = await studiosRef.get();
        if (snapshot.docs.some(doc => doc.id === studioName)) {
            return res.status(400).json({ error: 'Эта студия уже существует!' });
        }

        await studiosRef.doc(studioName).set({});

        res.json({ message: 'Студия успешно создана!' });
    } catch (error) {
        console.error('Ошибка при добавлении студии:', error);
        res.status(500).json({ error: 'Ошибка при добавлении студии' });
    }
});


app.get('/get-studios', async (req, res) => {
    try {
        const studiosRef = db.collection('studios');
        const snapshot = await studiosRef.get();
        const studios = snapshot.docs.map(doc => doc.id);
        res.json({ studios });
    } catch (error) {
        console.error('Ошибка при получении студий:', error);
        res.status(500).json({ error: 'Ошибка при получении студий' });
    }
});

app.delete('/studios/:studioName', async (req, res) => {
    const studioName = req.params.studioName;

    try {
        await db.collection('studios').doc(studioName).delete();

        res.json({ message: 'Студия успешно удалена!' });
    } catch (error) {
        console.error('Ошибка при удалении студии:', error);
        res.status(500).json({ error: 'Ошибка при удалении студии' });
    }
});





app.get('/get-admins-entry', async (req, res) => {
    try {
        const adminsRef = db.collection('admins');
        const snapshot = await adminsRef.get();
        const admins = snapshot.docs.map(doc => doc.id);
        res.json({ admins });
    } catch (error) {
        console.error('Ошибка при получении администраторов:', error);
        res.status(500).json({ error: 'Ошибка при получении администраторов' });
    }
});

app.get('/get-studios-user', async (req, res) => {
    try {
        const studiosRef = db.collection('studios');
        const snapshot = await studiosRef.get();
        const studios = snapshot.docs.map(doc => doc.id);
        res.json({ studios });
    } catch (error) {
        console.error('Ошибка при получении студий:', error);
        res.status(500).json({ error: 'Ошибка при получении студий' });
    }
});



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
