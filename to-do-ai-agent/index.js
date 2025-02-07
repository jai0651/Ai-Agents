import {db} from './db/index.js';
import { todosTable } from './db/schema.js';
import OpenAI from "openai";
import readlineSync from 'readline-sync';

const client = new OpenAI();


//Tools
async function getAllTodos() {
    const todos = await db.select().from(todosTable);
    return todos;
}

async function creatTodo(todo) {
    const [result] = await db.insert(todosTable).values({
        todo,
    })
    .returning({
        id:todosTable.id,
    });
    return result.id; 
}

async function searchTodo(searchParams) {
    const todos = await db.select().from(todosTable).where(todosTable.todo, 'ilike', `%${searchParams}%`);
    return todos;
}
async function deleteTodoById(id) {
    await db.delete().from(todosTable).where(todosTable.id, '=', id);
}

const tools = {
    getAllTodos: getAllTodos,
    creatTodo: creatTodo,
    searchTodo: searchTodo,
    deleteTodoById: deleteTodoById
};


const SYSTEM_PROMPT = `
You are an AI To-Do List Assistant with START, PLAN, ACTION, Observation and Output State.
Wait for the user prompt and first PLAN using the available tools.
After Planning, Take the action with appropriate tools and wait for Observation based on Action.
Once you ge the observations, Return the AI response bases on START prompt and observations

You can manage tasks by adding, viewing, updating and deleting. You must strictly follow the JSON output format.

Todo DB Schema:
 id:Int and Primary key
 todo:String
 created_at:Date Time
 updated_at:Date Time

Available Tools:
- getAllTodos(): Returns all the todos from Database
- creatTodo(todo:string):Creates a new Todo in the DB and takes todo as a string and returns the ID of created todo
- deleteTodoById(id:string): Deletes the todo by ID given in the DB
- searchTodo(search:String): Searches for all todo matching with the given search string in the DB with ilike operator

Example:
START
{"type","user","user":"Add a task for shopping groceries."}
{"type":"plan","plan":"I will try to get more context on what user needs to shop."}
{"type":"output","output":"Can you tell me what all items you want to shop for?"}
{"type":"user","user":"I want to shop for milk, kurkure and Lays"}
{"type":"plan","plan":"I will use createTodo to create a new Todo in DB."}
{"type":"action","function":"creatTodo","input":"Shopping for milk, kurkure and Lays"}}
{"type":"observation","observation":"2"}
{"type":"output","output":"your todo has been added successfully"}
`;

const messages = [{role:'system',content:SYSTEM_PROMPT}];

while(true){
   const query = readlineSync.question('>> ');
   const userMessage = {
    type:'user',
    user:query,
   }
   messages.push({role:'user',content:JSON.stringify(userMessage)});

   while(true){
    const chat = await client.chat.completions.create({
        model:'gpt-4o-mini',
        messages:messages,
        response_format:{type:'json_object'},
    });

    const result = chat.choices[0].message.content;
    messages.push({role:'assistant',content:result});

    const action= JSON.parse(result);

    if(action.type==='action'){
        console.log(`${action.output}`);
        break;
    }
    else if(action.type==='action'){
        const fn = tools[action.function];
        if(!fn) throw new Error('Invalid tool call');
        const observation = await fn(action.input);
        const observationMessage = {
            type:'observation',
            observation:observation,
        }
        messages.push({role:'developer',content:JSON.stringify(observationMessage)});
    }
   }
}