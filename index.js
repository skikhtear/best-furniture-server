const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")("sk_test_51MMWQgKOqMPoUvOiq1cyZLcUfFsTdAy3LVdgCHrKFbHIIViC3rBpl9SzOJXnmyGVM2infUdWib5D1EfbIl2FvTCs00lhy5uUuY");
require('dotenv').config();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.2op2kxu.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const productsCollection = client.db('best-furniture').collection('products');
const cartCollection = client.db('best-furniture').collection('cartProducts');
const usersCollection = client.db('best-furniture').collection('users');
const paymentsCollection = client.db('best-furniture').collection('payments');


async function run() {
    try {
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '24h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' })
        });

        app.get('/allproducts', async (req, res) => {
            const query = {};
            const result = await productsCollection.find(query).toArray();
            res.send(result)
        }) 

        app.get('/homefurniture', async (req, res) => {
            const id = req.params.id;
            const query = { category:'home' };
            const homeFurniture = await productsCollection.find(query).toArray();
            res.send(homeFurniture)

        });
        app.get('/officefurniture', async (req, res) => {
            const id = req.params.id;
            const query = { category:'office' };
            const officeFurniture = await productsCollection.find(query).toArray();
            res.send(officeFurniture)

        });
        app.get('/hospitalfurniture', async (req, res) => {
            const id = req.params.id;
            const query = { category:'hospital' };
            const hospitalFurniture = await productsCollection.find(query).toArray();
            res.send(hospitalFurniture)

        });

        app.get('/allproducts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productsCollection.findOne(query);
            res.send(product);
        })
        app.delete('/allproducts/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(filter);
            res.send(result);
        })
        app.post('/mycart',  async (req, res) => {
            const myCart = req.body;
            console.log(myCart);
            const query = {
                productName: myCart.name,
                price: myCart.price,
                email: myCart.email,
                img: myCart.img

            }

            const alreadyAddedCart = await cartCollection.find(query).toArray();

            if (alreadyAddedCart.length) {
                const message = `You already have a booking on ${myCart.name}`
                return res.send({ acknowledged: false, message })
            }

            const result = await cartCollection.insertOne(myCart);
            res.send(result)
        })

        app.get('/cart', async (req, res) => {
            const query = {};
            const myCart = await cartCollection.find(query).toArray();
            res.send(myCart);
        });

        app.get('/mycart', async (req, res) => {
            // const decoded = req.decoded;
            // console.log('inside review api', decoded);


            let query = {};

            if (req.query.email) {
                query = {
                    email: req.query.email
                }
            }

            const cursor = cartCollection.find(query);
            const myCart = await cursor.toArray();
            res.send(myCart);
        });

        app.delete('/mycart/:id',verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await cartCollection.deleteOne(filter);
            res.send(result);
        })
        app.get('/mycart/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const myCart = await cartCollection.findOne(query);
            res.send(myCart);
        })

        app.get('/allusers', async (req, res) => {
            const query = {};
            const result = await usersCollection.find(query).toArray();
            res.send(result)
        }) 
        app.delete('/allusers/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        });
         // Payment section

        app.post('/create-payment-intent', async (req, res) => {
            const myCart = req.body;
            const price = myCart.price;
            console.log(price);
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.myCartId
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await cartCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })
        app.get('/allpayments', async (req, res) => {
            const query = {};
            const result = await paymentsCollection.find(query).toArray();
            res.send(result)
        })
        app.delete('/allusers/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await paymentsCollection.deleteOne(filter);
            res.send(result);
        })
    }
    finally {
        
    }
}
run().catch(console.log)



app.get('/', async (req, res) => {
    res.send('Best Furniture server is running')
})
app.listen(port, () => console.log(`Best Furniture server running on ${port}`))



