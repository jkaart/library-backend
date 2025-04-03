const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const { GraphQLError } = require('graphql')

const mongoose = require('mongoose')
mongoose.set('strictQuery', false)

require('dotenv').config()

const Book = require('./models/book')
const Author = require('./models/author')
const author = require('./models/author')

const MONGODB_URI = process.env.MONGODB_URI

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `
  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]
  }
  
  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ):Book!

    editAuthor(
      name: String!
      setBornTo: Int!
    ):Author
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    genres: [String!]!
    id: ID!
  }
  
  type Author {
    name: String!
    bookCount: Int!,
    born: Int,
    id: ID!
  }
 `

const resolvers = {
  Query: {
    bookCount: async () => Book.collection.countDocuments(),
    authorCount: async () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      const books = await Book.find({}).populate('author')

      if (!(args.author || args.genre)) {
        return books
      }
      let filteredBooks = []
      if (args.author) {
        filteredBooks = books.filter(book => book.author === args.author)
      }
      if (args.genre) {
        const booksByGenre = books.filter(book => book.genres.includes(args.genre))
        filteredBooks = filteredBooks.concat(booksByGenre)
      }
      return filteredBooks
    },
    allAuthors: async () => Author.find({})
  },
  Author: {
    bookCount: async (root) => {
      return Book.collection.countDocuments({ author: root })
    },
    name: async (root) => {
      const author = await Author.findById(root)
      return author.name
    }
  },
  Mutation: {
    addBook: async (root, args) => {
      try {
        const existingBook = await Book.findOne({ title: args.title })
        if (existingBook) {
          throw new GraphQLError('Book title must be unique', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.title,
              error
            }
          })
        }
        let author = await Author.findOne({ name: args.author })
        if (!author) {
          author = new Author({ name: args.author, born: null })
          await author.save()
            .catch(error => {
              console.log(error)
              throw new GraphQLError('Author saving failed', {
                extensions: {
                  code: 'BAD_USER_INPUT',
                  invalidArgs: args.author,
                  error
                }
              })
            })
        }
        const book = new Book({ ...args, author: author._id })
        return book.save()
          .catch(error => {
            console.log(error)
            throw new GraphQLError('Book title must be unique', {
              extensions: {
                code: 'BAD_USER_INPUT',
                invalidArgs: args.title,
                error
              }
            })
          })
      }
      catch (error) {
        console.log(error)
        return error
      }
    },
    editAuthor: async (root, args) => {
      return Author.findOneAndUpdate({ name: args.name }, { born: args.setBornTo }, { new: true })
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})