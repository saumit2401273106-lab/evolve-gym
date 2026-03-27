const express = require('express');
const cors = require('cors');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const adapter = new FileSync('db.json');
const db = low(adapter);

// Set default database structure
db.defaults({ 
    users: [], 
    attendance: [], 
    trainerAttendance: [], 
    progress: [], 
    orders: [], 
    workouts: [], 
    diets: [] 
}).write();

let dx = db.get('users').value();
if(!dx.some(u => u.role === 'member' && u.email === 'member@evolve.com')) {
    db.get('users').push({ id:'m1', name:'John Doe', email:'member@evolve.com', pass:'member123', role:'member', age:25, weight:80, targetWeight:70, plan:'Pro', reg: new Date().toLocaleDateString('en-CA') }).write()
}
if(!dx.some(u => u.role === 'trainer' && u.email === 'trainer@evolve.com')) {
    db.get('users').push({ id:'t1', name:'Raj Singh', email:'trainer@evolve.com', pass:'trainer123', role:'trainer', reg: new Date().toLocaleDateString('en-CA') }).write()
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// AUTH
app.post('/api/register', (req, res) => {
    let existing = db.get('users').find({ email: req.body.email }).value()
    if(existing) return res.status(400).json({ error: 'Email exists' })

    let user = {
        id: 'u' + Date.now(),
        name: req.body.name,
        email: req.body.email,
        pass: req.body.pass,
        age: req.body.age,
        sw: req.body.weight,
        tw: req.body.targetWeight,
        weight: req.body.weight,
        targetWeight: req.body.targetWeight,
        plan: req.body.plan,
        role: 'member',
        reg: new Date().toLocaleDateString('en-CA')
    }

    db.get('users').push(user).write()
    res.json(user)
});

app.post('/api/login', (req, res) => {
    let user = db.get('users')
        .find({ email: req.body.email, pass: req.body.pass, role: req.body.role })
        .value()

    user ? res.json(user) : res.status(401).json({ error: 'Invalid login' })
});

// MEMBER APIs
app.get('/api/user/:id', (req, res) => {
    res.json(db.get('users').find({id: req.params.id}).value() || {});
});

app.get('/api/attendance/:id', (req, res) => {
    res.json(db.get('attendance').filter({userId: req.params.id}).value() || []);
});

app.post('/api/attendance/checkin', (req, res) => {
    let record = { userId: req.body.userId, date: req.body.date, ts: Date.now() };
    db.get('attendance').push(record).write();
    db.get('users').find({id: req.body.userId}).assign({lastSeen: req.body.date}).write();
    res.json(record);
});

app.get('/api/progress/:id', (req, res) => {
    res.json(db.get('progress').filter({userId: req.params.id}).value() || []);
});

app.post('/api/progress/log', (req, res) => {
    let record = { userId: req.body.userId, date: req.body.date, weight: req.body.weight, notes: req.body.notes };
    db.get('progress').push(record).write();
    db.get('users').find({id: req.body.userId}).assign({weight: req.body.weight}).write();
    res.json(record);
});

app.get('/api/workout/:id', (req, res) => {
    res.json(db.get('workouts').find({userId: req.params.id}).value() || { plan: null, completed: {} });
});

app.post('/api/workout/complete', (req, res) => {
    const { userId, day, exId, isDone } = req.body;
    let wk = db.get('workouts').find({userId}).value();
    if(!wk) { wk = { userId, plan: null, completed: {} }; db.get('workouts').push(wk).write(); }
    let comp = wk.completed || {};
    comp[`${day}_${exId}`] = isDone;
    db.get('workouts').find({userId}).assign({completed: comp}).write();
    res.json({success: true});
});

app.get('/api/diet/:id', (req, res) => {
    res.json(db.get('diets').find({userId: req.params.id}).value() || { plan: null, completed: {} });
});

app.post('/api/diet/eaten', (req, res) => {
    const { userId, date, mealId, isEaten } = req.body;
    let dt = db.get('diets').find({userId}).value();
    if(!dt) { dt = { userId, plan: null, completed: {} }; db.get('diets').push(dt).write(); }
    let comp = dt.completed || {};
    comp[`${date}_${mealId}`] = isEaten;
    db.get('diets').find({userId}).assign({completed: comp}).write();
    res.json({success: true});
});

// TRAINER APIs
app.get('/api/trainer/stats', (req, res) => {
    let members = db.get('users').filter({role: 'member'}).value();
    let attToday = db.get('attendance').filter({date: new Date().toLocaleDateString('en-CA')}).value().length;
    res.json({
        totalMembers: members.length,
        checkedInToday: attToday,
        avgAtt: members.length ? Math.round((attToday / members.length)*100) : 0,
        trainerSessions: db.get('trainerAttendance').value().length
    });
});

app.get('/api/trainer/members', (req, res) => {
    let members = db.get('users').filter({role: 'member'}).value();
    res.json(members.map(m => {
        return {
            ...m,
            attCount: db.get('attendance').filter({userId: m.id}).value().length,
            hasWk: !!db.get('workouts').find({userId: m.id}).value()?.plan,
            hasDt: !!db.get('diets').find({userId: m.id}).value()?.plan
        };
    }));
});

app.get('/api/trainer/attendance/:id', (req, res) => {
    res.json(db.get('trainerAttendance').filter({trainerId: req.params.id}).value() || []);
});

app.post('/api/trainer/attendance', (req, res) => {
    let record = { trainerId: req.body.trainerId, type: req.body.type, date: req.body.date, ts: req.body.ts };
    db.get('trainerAttendance').push(record).write();
    res.json(record);
});

app.post('/api/trainer/assign/workout', (req, res) => {
    const { memberId, planType, frequency, notes } = req.body;
    let fbWk=[
        {day:'Monday',title:planType,ex:[{id:'e1',n:'Bench Press',s:'4x10'},{id:'e2',n:'Incline Press',s:'3x12'},{id:'e3',n:'Cable Flyes',s:'3x15'},{id:'e4',n:'Tricep Dips',s:'3x12'},{id:'e5',n:'Tricep Pushdown',s:'3x15'}]},
        {day:'Wednesday',title:'Legs',ex:[{id:'e11',n:'Squats',s:'4x8'},{id:'e12',n:'Leg Press',s:'3x12'},{id:'e13',n:'Lunges',s:'3x10'},{id:'e14',n:'Leg Curls',s:'3x12'},{id:'e15',n:'Calf Raises',s:'4x15'}]},
        {day:'Friday',title:'Back and Core',ex:[{id:'e6',n:'Deadlift',s:'4x8'},{id:'e7',n:'Barbell Rows',s:'4x10'},{id:'e8',n:'Pull Ups',s:'3x8'},{id:'e21',n:'Plank',s:'3x60s'},{id:'e22',n:'Crunches',s:'3x20'}]}
    ];
    let plan = { days: fbWk, planType, frequency, notes };
    let wk = db.get('workouts').find({userId: memberId}).value();
    if(wk) db.get('workouts').find({userId: memberId}).assign({plan}).write();
    else db.get('workouts').push({userId: memberId, plan, completed: {}}).write();
    res.json({success: true});
});

app.post('/api/trainer/assign/diet', (req, res) => {
    const { memberId, goal, calories, restrictions, macros } = req.body;
    let pG = Math.round((calories * (macros.p/100)) / 4);
    let cG = Math.round((calories * (macros.c/100)) / 4);
    let fG = Math.round((calories * (macros.f/100)) / 9);
    let fbDt=[
        {id:'b',n:'Breakfast',cals:Math.round(calories*0.3),p:Math.round(pG*0.3),c:Math.round(cG*0.3),f:Math.round(fG*0.3),items:['Oats','Eggs','Banana']},
        {id:'l',n:'Lunch',cals:Math.round(calories*0.4),p:Math.round(pG*0.4),c:Math.round(cG*0.4),f:Math.round(fG*0.4),items:['Rice','Chicken/Paneer','Salad']},
        {id:'d',n:'Dinner',cals:Math.round(calories*0.3),p:Math.round(pG*0.3),c:Math.round(cG*0.3),f:Math.round(fG*0.3),items:['Roti','Vegetables','Curd']}
    ];
    let plan = { meals: fbDt, goal, calories, restrictions, macros };
    let dt = db.get('diets').find({userId: memberId}).value();
    if(dt) db.get('diets').find({userId: memberId}).assign({plan}).write();
    else db.get('diets').push({userId: memberId, plan, completed: {}}).write();
    res.json({success: true});
});

// ADMIN API
app.get('/api/admin/dump', (req, res) => res.json(db.getState()));

// SHOP API
app.get('/api/products', (req, res) => res.json([
    {
        id: "p1",
        name: "Whey Protein",
        price: 1499,
        category: "Supplements",
        icon: "https://beastlife.in/cdn/shop/files/Artboard4_96b62f55-565d-44fb-97a2-85b511986d04.png?v=1773406229",
        desc: "Protein powder for muscle growth"
    },
    {
        id: "p2",
        name: "Creatine",
        price: 799,
        category: "Supplements",
        icon: "https://wellversed.in/cdn/shop/collections/Brand_Banner_without_CTA___W.in___Wellcore___Wellversed_1200x600_crop_center.png?v=1750313579",
        desc: "Strength and endurance booster"
    },
    {
        id: "p3",
        name: "Gym Gloves",
        price: 499,
        category: "Accessories",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmpWvwyoOiQW-31pkgNeswca-87q7z1RTpUg&s",
        desc: "Grip and hand protection"
    },
    {
        id: "p4",
        name: "Shaker Bottle",
        price: 299,
        category: "Accessories",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS435SHTPtRt6P_CUkuZBooXlp5o4Svpzf9ug&s",
        desc: "Protein shaker bottle"
    },
    {
        id: "p5",
        name: "Resistance Bands",
        price: 599,
        category: "Equipment",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ33ePPa0RPg3TCuNOrKvWRe0r6hoNrwHvBng&s",
        desc: "Workout bands for training"
    },
    {
        id: "p6",
        name: "Pre Workout",
        price: 999,
        category: "Supplements",
        icon: "https://cloudinary.images-iherb.com/image/upload/f_auto,q_auto:eco/images/opn/opn05280/y/37.jpg",
        desc: "Energy booster supplement"
    },
    {
        id: "p7",
        name: "Protein Bar",
        price: 299,
        category: "Supplements",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR50Am-lsBJjELrfZYs2tFlyR07R2YVDdhG2w&s",
        desc: "Healthy snack bar"
    },
    {
        id: "p8",
        name: "Gym Shoes",
        price: 2499,
        category: "Apparel",
        icon: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
        desc: "Training shoes"
    },
    {
        id: "p9",
        name: "Dumbbell Set",
        price: 3999,
        category: "Equipment",
        icon: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61",
        desc: "Adjustable dumbbells"
    },
    {
        id: "p10",
        name: "Yoga Mat",
        price: 799,
        category: "Equipment",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTOuoa7F7lvfiXBKTKmDcp-1Yd8zOgTjyoVIA&s",
        desc: "Non-slip yoga mat"
    },
    {
        id: "p11",
        name: "Gym Bag",
        price: 400,
        category: "Accessories",
        icon: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR2miM6PLLxnMaceRXSmZ9zqPnNGX9E4elN-w&s",
        desc: "Gym carry bag"
    }
]));

app.post('/api/cart/checkout', (req, res) => {
    db.get('orders').push({...req.body, date: new Date().toLocaleDateString('en-CA')}).write();
    res.json({ success: true });
});

app.listen(3000, () => {
    console.log('🚀 Server running at http://localhost:3000');
});